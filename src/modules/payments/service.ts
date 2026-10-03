import "server-only";

import { Prisma } from "@prisma/client";

import { withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { can } from "@/modules/permissions/service";
import { PermissionDeniedError, ValidationError } from "@/modules/shared/errors";
import { getTenantContext } from "@/modules/tenancy/context";

import { recalculateFolioBalance } from "../folios/service";
import type { CreatePaymentInput } from "../folios/schemas";

/**
 * Service de paiement (PROMPTMVP sections 25, 53, 70, 116 et 135).
 *
 * Règle 6 du §81 : un paiement ne peut pas dépasser le montant autorisé
 * sans règle explicite de surpaiement. La section 116 définit cette règle :
 * l'excédent devient un avoir (`creditBalance`), il n'est ni perdu ni
 * refusé.
 *
 * La section 53 impose que toute opération financière soit transactionnelle :
 * le paiement, son affectation au folio et la mise à jour du solde
 * forment une seule unité.
 */

const PAYMENT_PERMISSION = "payment.create";

export interface PaymentResult {
  paymentId: string;
  paymentNumber: string;
  /** Montant effectivement imputé au folio. */
  appliedAmount: bigint;
  /** Excédent converti en avoir. */
  creditAmount: bigint;
  folioBalance: bigint;
  wasIdempotentReplay: boolean;
}

/** Séquence des numéros de paiement, par établissement. */
async function nextPaymentNumber(
  tx: PrismaTransactionClient,
  propertyId: string,
): Promise<string> {
  const latest = await tx.payment.findFirst({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    select: { paymentNumber: true },
  });

  const prefix = new Date().toISOString().slice(0, 7).replace("-", "");
  const match = latest?.paymentNumber.match(/-(\d+)$/);
  const sequence = (match ? Number.parseInt(match[1], 10) : 0) + 1;

  return `PAY-${prefix}-${String(sequence).padStart(5, "0")}`;
}

/** Répartition d'un paiement entre montant imputé et avoir. */
export interface PaymentSplit {
  appliedAmount: bigint;
  creditAmount: bigint;
}

/**
 * Répartit un paiement entre le solde dû et l'avoir.
 *
 * Le solde dû peut être négatif si un avoir existe déjà : dans ce cas, le
 * paiement solde d'abord cet avoir, ce qui évite de demander deux fois au
 * client ce qu'il a déjà avancé.
 */
export function splitPayment(
  amount: bigint,
  balance: bigint,
  creditBalance: bigint,
  allowOverpayment: boolean,
): PaymentSplit {
  const dueAmount = balance > 0n ? balance : 0n;
  const existingCredit = creditBalance > 0n ? creditBalance : 0n;
  const totalDue = dueAmount + existingCredit;

  if (amount <= totalDue) {
    return { appliedAmount: amount, creditAmount: 0n };
  }

  // Règle 6 : le surpaiement doit être explicitement autorisé. Le refus
  // par défaut protège l'hôtel d'une saisie involontaire.
  if (!allowOverpayment) {
    throw new ValidationError(
      "Ce paiement dépasse le solde dû. Activez le trop-perçu pour conserver l'excédent en avoir.",
    );
  }

  return { appliedAmount: totalDue, creditAmount: amount - totalDue };
return { appliedAmount: totalDue, creditAmount: amount - totalDue };
}

/**
 * Enregistre un encaissement sur un folio (sections 53 et 116).
 *
 * Trois cas sont traités :
 *   - paiement partiel : le solde diminue du montant imputé ;
 *   - paiement exact : le folio passe `PAID` ;
 *   - surpaiement autorisé : le solde tombe à zéro et l'excédent devient un
 *     avoir conservé sur le folio, conformément à la section 116.
 */
export async function createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, PAYMENT_PERMISSION))) {
    throw new PermissionDeniedError(PAYMENT_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    // Sections 70 et 135 : un rejeu de la même requête retourne le paiement
    // existant au lieu d'en créer un second.
    const replay = await findIdempotentReplay(tx, tenant.propertyId, input.idempotencyKey);
    if (replay) {
      return replay;
    }

    const folio = await tx.folio.findFirst({
      where: { id: input.folioId, propertyId: tenant.propertyId },
      select: { id: true, status: true, balance: true, creditBalance: true, currency: true },
    });

    if (!folio) {
      throw new ValidationError("Folio introuvable pour cet établissement.");
    }

    if (folio.status === "CLOSED") {
      throw new ValidationError("Ce folio est clôturé : il n'accepte plus de paiement.");
    }

    const split = splitPayment(
      input.amount,
      folio.balance,
      folio.creditBalance,
      input.overpayAsCredit,
    );

    const paymentNumber = await nextPaymentNumber(tx, tenant.propertyId);

    const payment = await tx.payment.create({
      data: {
        propertyId: tenant.propertyId,
        paymentNumber,
        folioId: folio.id,
        amount: input.amount,
        currency: folio.currency,
        method: input.method,
        status: "COMPLETED",
        reference: input.reference ?? null,
        externalReference: input.externalReference ?? null,
        paidAt: input.paidAt ?? new Date(),
        receivedBy: tenant.userId,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    });

    if (split.appliedAmount > 0n) {
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, folioId: folio.id, amount: split.appliedAmount },
      });
    }

    // L'avoir vient en déduction : le client ne doit pas être débité deux
    // fois de la même somme.
    const existingCredit = folio.creditBalance > 0n ? folio.creditBalance : 0n;
    const consumedCredit = existingCredit > 0n ? split.appliedAmount - (folio.balance > 0n ? folio.balance : 0n) : 0n;
    const finalCredit = existingCredit - (consumedCredit > 0n ? consumedCredit : 0n);

    await tx.folio.update({
      where: { id: folio.id },
      data: {
        creditBalance: finalCredit,
      },
    });

    const balance = await recalculateFolioBalance(tx, folio.id);

    await tx.folio.update({
      where: { id: folio.id },
      data: { status: balance <= 0n ? "PAID" : "PARTIALLY_PAID" },
    });

    // Section 53 : tout paiement est journalisé.
    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "payment.create",
        resource: "payment",
        resourceId: payment.id,
        afterData: {
          paymentNumber,
          amount: input.amount.toString(),
          appliedAmount: split.appliedAmount.toString(),
          creditAmount: split.creditAmount.toString(),
          method: input.method,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.outboxEvent.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        eventType: "PaymentCompleted",
        aggregateType: "payment",
        aggregateId: payment.id,
        payload: { paymentId: payment.id, folioId: folio.id } as Prisma.InputJsonValue,
      },
    });

    return {
      paymentId: payment.id,
      paymentNumber,
      appliedAmount: split.appliedAmount,
      creditAmount: split.creditAmount,
      folioBalance: balance,
      wasIdempotentReplay: false,
    };
  });
}

/**
 * Recherche un paiement déjà enregistré pour cette clé d'idempotence.
 * Retourne `null` si la clé est nouvelle ou absente.
 */
async function findIdempotentReplay(
  tx: PrismaTransactionClient,
  propertyId: string,
  idempotencyKey: string | undefined,
): Promise<PaymentResult | null> {
  if (!idempotencyKey) {
    return null;
  }

  const existing = await tx.payment.findFirst({
    where: { propertyId, idempotencyKey },
    select: { id: true, paymentNumber: true, amount: true, folioId: true },
  });

  if (!existing?.folioId) {
    return null;
  }

  const balance = await recalculateFolioBalance(tx, existing.folioId);

  return {
    paymentId: existing.id,
    paymentNumber: existing.paymentNumber,
    appliedAmount: existing.amount,
    creditAmount: 0n,
    folioBalance: balance,
    wasIdempotentReplay: true,
  };
}
