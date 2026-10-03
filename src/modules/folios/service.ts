import "server-only";

import { Prisma } from "@prisma/client";

import { withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { can } from "@/modules/permissions/service";
import { PermissionDeniedError, ValidationError } from "@/modules/shared/errors";
import { getTenantContext } from "@/modules/tenancy/context";

import { computeChargeAmounts, type ChargeAmounts } from "./money";
import type { PostChargeInput, VoidChargeInput } from "./schemas";

/**
 * Service de folio (PROMPTMVP sections 23, 24, 51 et 116).
 *
 * Deux invariants tiennent dans toute la base :
 *
 *   1. Une ligne de folio n'est jamais supprimée. Une erreur de saisie se
 *      corrige par un void suivi d'une écriture compensatoire (§51), et un
 *      trigger PostgreSQL interdit la suppression physique.
 *   2. `net + tax = gross` est garanti par une contrainte CHECK : un folio
 *      dont les totaux ne se recoupent pas est un folio faux.
 *
 * Le solde est dénormalisé sur `folios.balance` pour l'affichage, mais
 * recalculé depuis les lignes à chaque écriture : un solde divergent serait
 * le point de départ d'un litige avec un client.
 */

const POST_CHARGE_PERMISSION = "folio.post_charge";
const VOID_CHARGE_PERMISSION = "folio.void";

/**
 * Recalcule le solde d'un folio depuis ses lignes actives.
 *
 * Le solde est la somme des lignes non annulées, diminuée des paiements
 * affectés. Une ligne voidée ne compte plus, mais reste consultable dans
 * l'historique.
 */
export async function recalculateFolioBalance(
  tx: PrismaTransactionClient,
  folioId: string,
): Promise<bigint> {
  const [charges, payments] = await Promise.all([
    tx.folioItem.aggregate({
      where: { folioId, voidedAt: null },
      _sum: { grossAmount: true },
    }),
    tx.paymentAllocation.aggregate({
      where: { folioId },
      _sum: { amount: true },
    }),
  ]);

  const balance = (charges._sum.grossAmount ?? 0n) - (payments._sum.amount ?? 0n);

  await tx.folio.update({ where: { id: folioId }, data: { balance } });

  return balance;
}

export interface PostedCharge {
  folioItemId: string;
  netAmount: bigint;
  taxAmount: bigint;
  grossAmount: bigint;
  folioBalance: bigint;
  taxRatePercent: number | null;
}

/**
 * Impute une prestation sur un folio (section 51).
 *
 * La ligne créée est immuable : elle ne sera plus modifiée. Toute
 * correction passera par `voidCharge`, qui crée une écriture compensatoire.
 */
export async function postCharge(input: PostChargeInput): Promise<PostedCharge> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, POST_CHARGE_PERMISSION))) {
    throw new PermissionDeniedError(POST_CHARGE_PERMISSION);
  }

  const amounts = computeChargeAmounts(input.quantity, input.unitAmount, input.taxRatePercent);

  return withTenantContext(tenant, async (tx) => {
    const folio = await tx.folio.findFirst({
      where: { id: input.folioId, propertyId: tenant.propertyId },
      select: {
        id: true,
        status: true,
        balance: true,
        creditLimit: true,
        stay: { select: { property: { select: { businessDate: true } } } },
      },
    });

    if (!folio) {
      throw new ValidationError("Folio introuvable pour cet établissement.");
    }

    // Un folio clôturé n'accepte plus d'écriture : c'est la condition pour
    // qu'une facture émise reste juste.
    if (folio.status === "CLOSED") {
      throw new ValidationError("Ce folio est clôturé et n'accepte plus d'écriture.");
    }

    // Section 117 : le crédit d'entreprise plafonne l'encours.
    if (folio.creditLimit > 0n && folio.balance + amounts.grossAmount > folio.creditLimit) {
      throw new ValidationError(
        "Ce folio dépasse la limite de crédit autorisée. Soldez le folio ou demandez une dérogation.",
      );
    }

    const item = await tx.folioItem.create({
      data: {
        folioId: folio.id,
        propertyId: tenant.propertyId,
        // La charge est imputée sur la date d'exploitation de
        // l'établissement (section 105), pas sur la date du jour.
        businessDate: folio.stay.property.businessDate,
        type: input.type,
        category: input.category ?? null,
        description: input.description,
        quantity: new Prisma.Decimal(input.quantity),
        unitAmount: input.unitAmount,
        netAmount: amounts.netAmount,
        taxAmount: amounts.taxAmount,
        grossAmount: amounts.grossAmount,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        postedBy: tenant.userId,
      },
      select: { id: true },
    });

    const balance = await recalculateFolioBalance(tx, folio.id);

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "folio.post_charge",
        resource: "folio_item",
        resourceId: item.id,
        afterData: {
          folioId: folio.id,
          grossAmount: amounts.grossAmount.toString(),
          description: input.description,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      folioItemId: item.id,
      netAmount: amounts.netAmount,
      taxAmount: amounts.taxAmount,
      grossAmount: amounts.grossAmount,
      folioBalance: balance,
      taxRatePercent: input.taxRatePercent ?? null,
    };
  });
}
export interface VoidResult {
  voidedItemId: string;
  /** Ligne compensatoire créée par l'annulation. */
  correctiveItemId: string;
  folioBalance: bigint;
}

/**
 * Annule une charge (section 51).
 *
 * La section 51 est explicite : « une correction doit créer VOID + corrective
 * transaction, et non supprimer la transaction initiale ». La ligne
 * d'origine est donc marquée voidée et une ligne compensatoire de sens
 * inverse est créée dans la même transaction.
 *
 * Le motif est obligatoire et journalisé : sans lui, l'audit de la section 42
 * ne permettrait pas de savoir qui a annulé quoi et pourquoi.
 */
export async function voidCharge(input: VoidChargeInput): Promise<VoidResult> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, VOID_CHARGE_PERMISSION))) {
    throw new PermissionDeniedError(VOID_CHARGE_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const item = await tx.folioItem.findFirst({
      where: { id: input.folioItemId, propertyId: tenant.propertyId },
      select: {
        id: true,
        folioId: true,
        description: true,
        netAmount: true,
        taxAmount: true,
        grossAmount: true,
        voidedAt: true,
        folio: {
          select: {
            status: true,
            stay: { select: { property: { select: { businessDate: true } } } },
          },
        },
      },
    });

    if (!item) {
      throw new ValidationError("Ligne de folio introuvable.");
    }

    if (item.voidedAt) {
      throw new ValidationError("Cette ligne a déjà été annulée.");
    }

    if (item.folio.status === "CLOSED") {
      throw new ValidationError("Ce folio est clôturé : aucune annulation n'est possible.");
    }

    // Étape 1 : la ligne d'origine est marquée, pas supprimée.
    await tx.folioItem.update({
      where: { id: item.id },
      data: {
        voidedAt: new Date(),
        voidedBy: tenant.userId,
        voidReason: input.reason,
      },
    });

    // Étape 2 : écriture compensatoire de sens inverse. Sans elle, le
    // montant resterait dû alors que la prestation a été annulée.
    const corrective = await tx.folioItem.create({
      data: {
        folioId: item.folioId,
        propertyId: tenant.propertyId,
        businessDate: item.folio.stay.property.businessDate,
        type: "ADJUSTMENT",
        description: `Annulation : ${item.description}`,
        quantity: new Prisma.Decimal(1),
        unitAmount: -item.netAmount,
        netAmount: -item.netAmount,
        taxAmount: -item.taxAmount,
        grossAmount: -item.grossAmount,
        referenceType: "folio_item",
        referenceId: item.id,
        postedBy: tenant.userId,
      },
      select: { id: true },
    });

    const balance = await recalculateFolioBalance(tx, item.folioId);

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "folio.void",
        resource: "folio_item",
        resourceId: item.id,
        beforeData: { grossAmount: item.grossAmount.toString(), voidedAt: null },
        afterData: {
          correctiveItemId: corrective.id,
          reason: input.reason,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      voidedItemId: item.id,
      correctiveItemId: corrective.id,
      folioBalance: balance,
    };
  });
}
