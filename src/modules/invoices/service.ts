import "server-only";

import { Prisma } from "@prisma/client";

import { withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { can } from "@/modules/permissions/service";
import { PermissionDeniedError, ValidationError } from "@/modules/shared/errors";
import { getTenantContext } from "@/modules/tenancy/context";
import { applyTaxRules, type TaxRuleInput } from "@/modules/tax/engine";

import type { CreateInvoiceInput, FinalizeInvoiceInput } from "./schemas";

/**
 * Service de facturation (PROMPTMVP sections 28, 29, 52 et règle 7).
 *
 * La facture est construite à partir des lignes actives du folio. Le
 * client ne fournit aucun montant : les totaux sont recalculés, ce qui rend
 * une facture fausse impossible à saisir manuellement.
 *
 * Deux états coexistent :
 *   - `DRAFT` : les lignes peuvent être ajustées ;
 *   - `FINALIZED` : les montants sont verrouillés. Un trigger PostgreSQL
 *     interdit toute modification ultérieure (règle 7).
 */

const CREATE_PERMISSION = "invoice.create";
const FINALIZE_PERMISSION = "invoice.finalize";

export interface CreatedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  subtotal: bigint;
  taxAmount: bigint;
  totalAmount: bigint;
  itemCount: number;
  taxes: { code: string; amount: bigint; ratePercent: number | null }[];
}

/** Séquence des numéros de facture, par établissement. */
async function nextInvoiceNumber(
  tx: PrismaTransactionClient,
  propertyId: string,
): Promise<string> {
  const latest = await tx.invoice.findFirst({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });

  const prefix = new Date().toISOString().slice(0, 7).replace("-", "");
  const match = latest?.invoiceNumber.match(/-(\d+)$/);
  const sequence = (match ? Number.parseInt(match[1], 10) : 0) + 1;

  return `FAC-${prefix}-${String(sequence).padStart(5, "0")}`;
}

/**
 * Charge les règles fiscales applicables à une date donnée.
 *
 * La section 30 impose un versionnement par date d'effet : une facture émise
 * en mars 2026 doit utiliser les règles de mars 2026, pas celles d'aujourd'hui
 * si elles ont changé depuis.
 */
async function loadApplicableTaxRules(
  tx: PrismaTransactionClient,
  propertyId: string,
  businessDate: Date,
): Promise<TaxRuleInput[]> {
  const rules = await tx.taxRule.findMany({
    where: {
      propertyId,
      isActive: true,
      effectiveFrom: { lte: businessDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: businessDate } }],
    },
    select: { code: true, rate: true, fixedAmount: true, isInclusive: true },
    orderBy: { code: "asc" },
  });

  return rules.map((rule) => ({
    code: rule.code,
    ratePercent: rule.rate ? Number(rule.rate) : null,
    fixedAmount: rule.fixedAmount,
    isInclusive: rule.isInclusive,
  }));
}

/**
 * Crée une facture depuis les lignes actives d'un folio (section 52).
 *
 * Les lignes annulées sont exclues : une charge annulée ne doit pas être
 * facturée.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CREATE_PERMISSION))) {
    throw new PermissionDeniedError(CREATE_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const folio = await tx.folio.findFirst({
      where: { id: input.folioId, propertyId: tenant.propertyId },
      select: {
        id: true,
        folioNumber: true,
        currency: true,
        guestId: true,
        companyId: true,
        stay: { select: { property: { select: { businessDate: true } } } },
      },
    });

    if (!folio) {
      throw new ValidationError("Folio introuvable pour cet établissement.");
    }

    const lines = await tx.folioItem.findMany({
      where: { folioId: folio.id, voidedAt: null, type: { not: "ADJUSTMENT" } },
      select: {
        id: true,
        description: true,
        quantity: true,
        netAmount: true,
        taxAmount: true,
        grossAmount: true,
        businessDate: true,
        referenceType: true,
        referenceId: true,
      },
      orderBy: { businessDate: "asc" },
    });

    if (lines.length === 0) {
      throw new ValidationError("Ce folio ne comporte aucune charge facturable.");
    }

    const businessDate = lines[0]?.businessDate ?? folio.stay.property.businessDate;
    const rules = await loadApplicableTaxRules(tx, tenant.propertyId, businessDate);

    // Le sous-total reprend les nets des lignes. Les taxes sont celles
    // calculées à l'imputation : les recalculer ici risquerait un écart
    // entre ce que le client a payé et ce qui est facturé.
    const subtotal = lines.reduce((total, line) => total + line.netAmount, 0n);
    const taxAmount = lines.reduce((total, line) => total + line.taxAmount, 0n);
    const totalAmount = lines.reduce((total, line) => total + line.grossAmount, 0n);

    // Les règles sont évaluées pour produire le détail fiscal exigé sur la
    // facture, même si l'imputation les a déjà appliquées.
    const expected = applyTaxRules(subtotal, rules);

    const invoiceNumber = await nextInvoiceNumber(tx, tenant.propertyId);

    const invoice = await tx.invoice.create({
      data: {
        propertyId: tenant.propertyId,
        invoiceNumber,
        folioId: folio.id,
        guestId: folio.guestId,
        companyId: folio.companyId,
        status: "DRAFT",
        invoiceType: input.invoiceType,
        currency: folio.currency,
        subtotal,
        taxAmount,
        totalAmount,
        amountPaid: 0n,
        balanceDue: totalAmount,
        dueAt: input.dueAt ?? null,
        createdBy: tenant.userId,
      },
      select: { id: true, invoiceNumber: true },
    });

    await tx.invoiceItem.createMany({
      data: lines.map((line) => ({
        invoiceId: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.grossAmount,
        discountAmount: 0n,
        netAmount: line.netAmount,
        taxAmount: line.taxAmount,
        grossAmount: line.grossAmount,
        referenceType: line.referenceType,
        referenceId: line.referenceId,
      })),
    });

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "invoice.create",
        resource: "invoice",
        resourceId: invoice.id,
        afterData: {
          invoiceNumber: invoice.invoiceNumber,
          folioNumber: folio.folioNumber,
          subtotal: subtotal.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
          itemCount: lines.length,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      subtotal,
      taxAmount,
      totalAmount,
      itemCount: lines.length,
      taxes: expected.breakdown.map((entry) => ({
        code: entry.code,
        amount: entry.amount,
        ratePercent: entry.ratePercent,
      })),
    };
  });
}

/**
 * Finalise une facture (section 52, règle 7).
 *
 * Après finalisation, le trigger PostgreSQL `invoices_immutable_after_finalization`
 * interdit toute modification : les montants deviennent définitifs. Un
 * événement outbox est écrit pour déclencher la certification FNE, sans
 * appel HTTP dans cette transaction (section 95).
 */
export async function finalizeInvoice(input: FinalizeInvoiceInput): Promise<{ invoiceId: string }> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, FINALIZE_PERMISSION))) {
    throw new PermissionDeniedError(FINALIZE_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, propertyId: tenant.propertyId },
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true },
    });

    if (!invoice) {
      throw new ValidationError("Facture introuvable pour cet établissement.");
    }

    if (invoice.status !== "DRAFT") {
      throw new ValidationError(
        `Cette facture est au statut ${invoice.status} et ne peut plus être finalisée.`,
      );
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "FINALIZED", issuedAt: new Date() },
    });

    // Section 33 : la certification passe par l'outbox, jamais par un appel
    // HTTP tenu dans une transaction ouverte.
    await tx.outboxEvent.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        eventType: "InvoiceFinalized",
        aggregateType: "invoice",
        aggregateId: invoice.id,
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount.toString(),
        } as Prisma.InputJsonValue,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "invoice.finalize",
        resource: "invoice",
        resourceId: invoice.id,
        beforeData: { status: "DRAFT" },
        afterData: { status: "FINALIZED", issuedAt: new Date().toISOString() },
      },
    });

    return { invoiceId: invoice.id };
  });
}
