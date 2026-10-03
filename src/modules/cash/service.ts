import "server-only";

import { Prisma } from "@prisma/client";

import { withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { can } from "@/modules/permissions/service";
import { PermissionDeniedError, ValidationError } from "@/modules/shared/errors";
import { getTenantContext } from "@/modules/tenancy/context";

import type {
  CloseCashSessionInput,
  CreateCashMovementInput,
  OpenCashSessionInput,
} from "../folios/schemas";
import { reconcile, type CashReconciliation } from "./reconciliation";

/**
 * Service de caisse (PROMPTMVP sections 34 et 56).
 *
 * La caisse est le point de contact entre le PMS et l'encaissement réel.
 * Le calcul de réconciliation est isolé dans `reconciliation.ts` et testé
 * sans base : c'est le seul calcul qui doit être exact, et il ne dépend que
 * de trois nombres.
 */

const CASHIER_PERMISSION = "payment.create";

export type { CashReconciliation };

/** Charge la session et ses mouvements, puis délègue le calcul. */
async function computeReconciliation(
  tx: PrismaTransactionClient,
  cashSessionId: string,
  countedCash: bigint,
): Promise<CashReconciliation> {
  const session = await tx.cashSession.findUniqueOrThrow({
    where: { id: cashSessionId },
    select: { openingBalance: true },
  });

  const movements = await tx.cashMovement.findMany({
    where: { cashSessionId },
    select: { type: true, amount: true },
  });

  return reconcile(session.openingBalance, movements, countedCash);
}

/**
 * Ouvre une session de caisse (section 34).
 *
 * Un même caissier ne peut pas ouvrir deux sessions simultanées : sans
 * cette règle, le rapprochement de la clôture serait ambigu.
 */
export async function openCashSession(
  input: OpenCashSessionInput,
): Promise<{ cashSessionId: string }> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CASHIER_PERMISSION))) {
    throw new PermissionDeniedError(CASHIER_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const register = await tx.cashRegister.findFirst({
      where: { id: input.cashRegisterId, propertyId: tenant.propertyId, isActive: true },
      select: { id: true },
    });

    if (!register) {
      throw new ValidationError("Caisse introuvable ou inactive pour cet établissement.");
    }

    const existing = await tx.cashSession.findFirst({
      where: {
        cashRegisterId: register.id,
        userId: tenant.userId,
        status: { in: ["OPEN", "CLOSING"] },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ValidationError(
        "Une session de caisse est déjà ouverte. Clôturez-la avant d'en ouvrir une autre.",
      );
    }

    const session = await tx.cashSession.create({
      data: {
        cashRegisterId: register.id,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        openingBalance: input.openingBalance,
        status: "OPEN",
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "cash.session_open",
        resource: "cash_session",
        resourceId: session.id,
        afterData: { openingBalance: input.openingBalance.toString() },
      },
    });

    return { cashSessionId: session.id };
  });
}

export interface CashSessionResult {
  cashSessionId: string;
  expectedBalance: bigint;
  variance: bigint;
}

/**
 * Clôture une session de caisse (section 56).
 *
 * La variance est calculée puis journalisée. Si elle est non nulle et non
 * justifiée, la clôture est refusée : l'écart doit être explicite, pas
 * silencieux.
 */
export async function closeCashSession(input: CloseCashSessionInput): Promise<CashSessionResult> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CASHIER_PERMISSION))) {
    throw new PermissionDeniedError(CASHIER_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const session = await tx.cashSession.findFirst({
      where: { id: input.cashSessionId, propertyId: tenant.propertyId },
      select: { id: true, status: true },
    });

    if (!session) {
      throw new ValidationError("Session de caisse introuvable.");
    }

    if (session.status === "CLOSED") {
      throw new ValidationError("Cette session de caisse est déjà clôturée.");
    }

    const reconciliation = await computeReconciliation(tx, input.cashSessionId, input.countedCash);

    // Section 56 : une variance exige une justification écrite.
    if (reconciliation.variance !== 0n && !input.varianceReason?.trim()) {
      throw new ValidationError(
        "Écart de caisse détecté. Une variance doit être justifiée avant de clôturer la session.",
      );
    }

    await tx.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closingBalance: input.countedCash,
        expectedBalance: reconciliation.expectedBalance,
        difference: reconciliation.variance,
        varianceReason: input.varianceReason ?? null,
        closedAt: new Date(),
        closedBy: tenant.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "cash.session_close",
        resource: "cash_session",
        resourceId: session.id,
        afterData: {
          expectedBalance: reconciliation.expectedBalance.toString(),
          countedCash: input.countedCash.toString(),
          variance: reconciliation.variance.toString(),
          reason: input.varianceReason ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    // La section 118 liste les alertes du tableau de bord : une caisse
    // présentant une variance doit y apparaître.
    if (reconciliation.variance !== 0n) {
      await tx.outboxEvent.create({
        data: {
          organizationId: tenant.organizationId,
          propertyId: tenant.propertyId,
          eventType: "CashVarianceDetected",
          aggregateType: "cash_session",
          aggregateId: session.id,
          payload: {
            cashSessionId: session.id,
            variance: reconciliation.variance.toString(),
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      cashSessionId: session.id,
      expectedBalance: reconciliation.expectedBalance,
      variance: reconciliation.variance,
    };
  });
}

/** Enregistre un mouvement de caisse (section 34). */
export async function createCashMovement(
  input: CreateCashMovementInput,
): Promise<{ movementId: string }> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CASHIER_PERMISSION))) {
    throw new PermissionDeniedError(CASHIER_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const session = await tx.cashSession.findFirst({
      where: { id: input.cashSessionId, propertyId: tenant.propertyId, status: "OPEN" },
      select: { id: true },
    });

    if (!session) {
      throw new ValidationError("Session de caisse introuvable ou clôturée.");
    }

    const movement = await tx.cashMovement.create({
      data: {
        cashSessionId: session.id,
        type: input.type,
        amount: input.amount,
        reason: input.reason ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        createdBy: tenant.userId,
      },
      select: { id: true },
    });

    return { movementId: movement.id };
  });
}
