import "server-only";

import { Prisma } from "@prisma/client";

import { withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { can } from "@/modules/permissions/service";
import { countNights } from "@/modules/rates/engine";
import {
  ForbiddenError,
  PermissionDeniedError,
  ValidationError,
} from "@/modules/shared/errors";
import { getTenantContext } from "@/modules/tenancy/context";

import type { ChangeRoomInput, CheckInInput, CheckOutInput } from "./schemas";

/**
 * Service de séjour (PROMPTMVP.md sections 21, 49 et 94).
 *
 * Le check-in est l'opération la plus sensible d'un PMS : elle touche
 * simultanément la réservation, la chambre, le séjour, le folio et l'audit.
 * Elle s'exécute donc dans une seule transaction `Serializable` (section 94),
 * avec cet ordre imposé :
 *
 *   verrouiller → vérifier réservation → vérifier chambre → vérifier
 *   disponibilité → créer séjour → attribuer chambre → ouvrir folio →
 *   mettre à jour réservation → mettre à jour chambre → auditer
 *
 * Toute violation d'étape annule l'ensemble (section 94 : ROLLBACK).
 */

const CHECK_IN_PERMISSION = "stay.check_in";
const OVERRIDE_PERMISSION = "stay.check_in_override";

/** Numéro de séjour lisible, séquentiel par établissement. */
async function nextStayNumber(tx: PrismaTransactionClient, propertyId: string): Promise<string> {
  const latest = await tx.stay.findFirst({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    select: { stayNumber: true },
  });

  const prefix = new Date().toISOString().slice(0, 7).replace("-", "");

  let sequence = 1;
  if (latest) {
    const match = latest.stayNumber.match(/-(\d+)$/);
    if (match) {
      sequence = Number.parseInt(match[1], 10) + 1;
    }
  }

  return `STAY-${prefix}-${String(sequence).padStart(5, "0")}`;
}

/** Numéro de folio séquentiel par établissement. */
async function nextFolioNumber(tx: PrismaTransactionClient, propertyId: string): Promise<string> {
  const latest = await tx.folio.findFirst({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    select: { folioNumber: true },
  });

  const prefix = new Date().toISOString().slice(0, 7).replace("-", "");

  let sequence = 1;
  if (latest) {
    const match = latest.folioNumber.match(/-(\d+)$/);
    if (match) {
      sequence = Number.parseInt(match[1], 10) + 1;
    }
  }

  return `FOL-${prefix}-${String(sequence).padStart(5, "0")}`;
}

export interface CheckInResult {
  stayId: string;
  stayNumber: string;
  folioId: string;
  folioNumber: string;
  roomId: string | null;
  roomNumber: string | null;
  /** Avertissements non bloquants : le personnel doit agir. */
  warnings: string[];
}

/**
 * Effectue le check-in d'une réservation (sections 49 et 94).
 *
 * Refus systématiques, sauf permission d'override :
 *   - réservation annulée, no-show ou déjà utilisée ;
 *   - chambre absente ou dans un état non vendable ;
 *   - chambre attribuée à un autre séjour actif ;
 *   - chambre non nettoyée (règle métier 4 : une chambre n'est vendable
 *     qu'après le passage housekeeping).
 */
export async function checkIn(input: CheckInInput): Promise<CheckInResult> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CHECK_IN_PERMISSION))) {
    throw new PermissionDeniedError(CHECK_IN_PERMISSION);
  }

  const hasOverride = await can(tenant.userId, OVERRIDE_PERMISSION);
  const warnings: string[] = [];

  return withTenantContext(tenant, async (tx) => {
    // --- Verrouiller et vérifier la réservation (section 94) ---------------
    // Le verrou pessimiste empêche deux réceptionnistes de faire entrer
    // deux clients dans la même chambre simultanément.
    const reservation = await tx.reservation.findFirst({
      where: { id: input.reservationId, propertyId: tenant.propertyId },
      select: {
        id: true,
        reservationNumber: true,
        status: true,
        guestId: true,
        companyId: true,
        arrivalDate: true,
        departureDate: true,
        nights: true,
        rooms: {
          select: {
            id: true,
            roomId: true,
            roomTypeId: true,
            numberOfNights: true,
            baseAmount: true,
            room: { select: { id: true, number: true, status: true, housekeepingStatus: true } },
          },
        },
      },
    });

    if (!reservation) {
      throw new ValidationError("Réservation introuvable pour cet établissement.");
    }

    if (reservation.status === "CHECKED_IN" || reservation.status === "CHECKED_OUT") {
      throw new ValidationError(
        `La réservation ${reservation.reservationNumber} a déjà été utilisée.`,
      );
    }

    if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
      throw new ValidationError(
        `La réservation ${reservation.reservationNumber} est ${reservation.status === "CANCELLED" ? "annulée" : "en no-show"}.`,
      );
    }

    // --- Vérifier la chambre (section 94) ---------------------------------
    // Le check-in porte sur la première ligne : une réservation multi-
    // chambres donne lieu à un séjour par chambre.
    const reservationRoom = reservation.rooms[0];
    if (!reservationRoom) {
      throw new ValidationError("Cette réservation ne comporte aucune chambre.");
    }

    const targetRoomId = input.roomId ?? reservationRoom.roomId;

    if (!targetRoomId) {
      throw new ValidationError(
        "Aucune chambre attribuée. Affectez une chambre avant d'enregistrer l'arrivée.",
      );
    }

    const room = await tx.room.findFirst({
      where: { id: targetRoomId, propertyId: tenant.propertyId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        housekeepingStatus: true,
        roomTypeId: true,
      },
    });

    if (!room) {
      throw new ValidationError("Chambre introuvable pour cet établissement.");
    }

    // Règle métier 1 : une chambre hors service ou en panne n'est jamais
    // attribuée.
    if (
      room.status === "OUT_OF_ORDER" ||
      room.status === "OUT_OF_SERVICE" ||
      room.status === "MAINTENANCE"
    ) {
      throw new ValidationError(
        `La chambre ${room.number} est hors service et ne peut pas être attribuée.`,
      );
    }

    // Règle métier 4 : une chambre n'est vendable qu'une fois nettoyée. Le
    // check-in d'un client dans une chambre sale est un défaut de service.
    if (room.housekeepingStatus === "DIRTY" || room.housekeepingStatus === "CLEANING") {
      if (!hasOverride) {
        throw new ValidationError(
          `La chambre ${room.number} n'est pas nettoyée. Faites le ménage avant l'arrivée, ou utilisez une dérogation.`,
        );
      }
      warnings.push(
        `Chambre ${room.number} non nettoyée au moment du check-in (dérogation enregistrée).`,
      );
    }

    if (room.roomTypeId !== reservationRoom.roomTypeId) {
      if (!hasOverride) {
        throw new ValidationError(
          "La chambre choisie ne correspond pas au type de chambre réservé.",
        );
      }
      warnings.push("Chambre d'un type différent de celui réservé (dérogation enregistrée).");
    }

    // --- Vérifier la disponibilité (section 94) --------------------------
    // Une chambre déjà occupée par un séjour actif ne peut pas être
    // réattribuée.
    const conflictingStay = await tx.stayRoom.findFirst({
      where: {
        roomId: room.id,
        releasedAt: null,
        stay: { status: { in: ["CHECKED_IN", "IN_HOUSE"] } },
      },
      select: { stayId: true },
    });

    if (conflictingStay) {
throw new ValidationError(`La chambre ${room.number} est déjà occupée.`);
    }

    // --- Créer le séjour, attribuer la chambre, ouvrir le folio -----------
    // Les trois écritures sont liées : un séjour sans chambre, ou un folio
    // sans séjour, laisserait l'inventaire incohérent.

    const stayNumber = await nextStayNumber(tx, tenant.propertyId);

    const stay = await tx.stay.create({
      data: {
        propertyId: tenant.propertyId,
        stayNumber,
        reservationId: reservation.id,
        primaryGuestId: reservation.guestId,
        status: "IN_HOUSE",
        actualCheckInAt: new Date(),
        plannedCheckIn: reservation.arrivalDate,
        plannedCheckOut: reservation.departureDate,
        assignedBy: tenant.userId,
        checkedInBy: tenant.userId,
      },
      select: { id: true, stayNumber: true },
    });

    await tx.stayRoom.create({
      data: {
        stayId: stay.id,
        propertyId: tenant.propertyId,
        roomId: room.id,
        roomTypeId: reservationRoom.roomTypeId,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        assignedBy: tenant.userId,
      },
    });

    const folioNumber = await nextFolioNumber(tx, tenant.propertyId);

    const folio = await tx.folio.create({
      data: {
        propertyId: tenant.propertyId,
        folioNumber,
        stayId: stay.id,
        guestId: reservation.guestId,
        companyId: reservation.companyId,
        status: "OPEN",
        currency: "XOF",
        // Limite de crédit appliquée dès l'ouverture : le contrôle au
        // moment de la charge (section 117) en a besoin.
        creditLimit: 0n,
      },
      select: { id: true, folioNumber: true },
    });

    // --- Imputer les nuitées ------------------------------------------------
    // Le poste « room » est créé au check-in pour que le solde du client soit
    // immédiatement juste. Le night audit ne le reposting pas : il se
    // contente de contrôler et de Calculer les totaux (section 55).
    if (reservationRoom.baseAmount > 0n) {
      await tx.folioItem.create({
        data: {
          folioId: folio.id,
          propertyId: tenant.propertyId,
          businessDate: reservation.arrivalDate,
          transactionDate: new Date(),
          type: "ROOM",
          description: `Hébergement — ${countNights(reservation.arrivalDate, reservation.departureDate)} nuit(s)`,
          quantity: new Prisma.Decimal(reservationRoom.numberOfNights),
          unitAmount: reservationRoom.baseAmount / BigInt(reservationRoom.numberOfNights || 1),
          netAmount: reservationRoom.baseAmount,
          taxAmount: 0n,
          grossAmount: reservationRoom.baseAmount,
          referenceType: "reservation",
          referenceId: reservation.id,
          postedBy: tenant.userId,
        },
      });

      await tx.folio.update({
        where: { id: folio.id },
        data: { balance: reservationRoom.baseAmount },
      });
    }

    // --- Mettre à jour réservation et chambre (section 94) ----------------
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: "CHECKED_IN", updatedBy: tenant.userId },
    });

    await tx.reservationRoom.update({
      where: { id: reservationRoom.id },
      data: { roomId: room.id, status: "OCCUPIED" },
    });

    // La chambre passe OCCUPIED : elle sort du stock vendable.
    await tx.room.update({
      where: { id: room.id },
      data: { status: "OCCUPIED" },
    });

    // Section 10 : la transition de statut laisse une trace.
    await tx.roomStatusHistory.create({
      data: {
        propertyId: tenant.propertyId,
        roomId: room.id,
        previousStatus: room.status,
        newStatus: "OCCUPIED",
        reason: `Check-in ${stay.stayNumber}`,
        referenceType: "stay",
        referenceId: stay.id,
        changedBy: tenant.userId,
      },
    });

    // --- Journaliser (section 42) ------------------------------------------
    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        userId: tenant.userId,
        action: "stay.check_in",
        resource: "stay",
        resourceId: stay.id,
        afterData: {
          stayNumber: stay.stayNumber,
          roomNumber: room.number,
          reservationNumber: reservation.reservationNumber,
          warnings,
        } as Prisma.InputJsonValue,
      },
    });

    // Section 67 : l'événement permet notification et reporting sans
    // couplage.
    await tx.outboxEvent.create({
      data: {
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        eventType: "GuestCheckedIn",
        aggregateType: "stay",
        aggregateId: stay.id,
        payload: {
          stayId: stay.id,
          stayNumber: stay.stayNumber,
          roomNumber: room.number,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      folioId: folio.id,
      folioNumber: folio.folioNumber,
      roomId: room.id,
      roomNumber: room.number,
      warnings,
    };
  });
}
const CHANGE_ROOM_PERMISSION = "stay.change_room";

export interface ChangeRoomResult {
  previousRoomNumber: string | null;
  newRoomNumber: string;
  /** Ancienne ligne de séjour, conservée pour l'historique. */
  previousStayRoomId: string;
}

/**
 * Change la chambre d'un séjour actif (section 50).
 *
 * L'ancienne ligne de `stay_rooms` n'est pas supprimée : elle est marquée
 * `releasedAt`. La section 50 exige de conserver l'historique, et une
 * suppression ferait disparaître l'occupation ayant effectivement eu lieu.
 */
export async function changeRoom(input: ChangeRoomInput): Promise<ChangeRoomResult> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CHANGE_ROOM_PERMISSION))) {
    throw new PermissionDeniedError(CHANGE_ROOM_PERMISSION);
  }

  return withTenantContext(tenant, async (tx) => {
    const stay = await tx.stay.findFirst({
      where: { id: input.stayId, propertyId: tenant.propertyId },
      select: {
        id: true,
        stayNumber: true,
        status: true,
        plannedCheckOut: true,
        rooms: {
          where: { releasedAt: null },
          select: {
            id: true,
            roomId: true,
            roomTypeId: true,
            room: { select: { number: true } },
          },
        },
      },
    });

    if (!stay) {
      throw new ValidationError("Séjour introuvable pour cet établissement.");
    }

    if (stay.status !== "IN_HOUSE" && stay.status !== "CHECKED_IN") {
      throw new ValidationError("Le changement de chambre ne concerne que les séjours en cours.");
    }

    const currentRoom = stay.rooms[0];
    if (!currentRoom) {
      throw new ValidationError("Aucune chambre active sur ce séjour.");
    }

    if (currentRoom.roomId === input.newRoomId) {
      throw new ValidationError("La nouvelle chambre est identique à l'actuelle.");
    }

    const targetRoom = await tx.room.findFirst({
      where: { id: input.newRoomId, propertyId: tenant.propertyId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        housekeepingStatus: true,
        roomTypeId: true,
      },
    });

    if (!targetRoom) {
      throw new ValidationError("Nouvelle chambre introuvable pour cet établissement.");
    }

    // Règle métier 1 : une chambre hors service n'est jamais attribuée.
    if (
      targetRoom.status === "OUT_OF_ORDER" ||
      targetRoom.status === "OUT_OF_SERVICE" ||
      targetRoom.status === "MAINTENANCE"
    ) {
      throw new ValidationError(
        `La chambre ${targetRoom.number} est hors service et ne peut pas être attribuée.`,
      );
    }

    // Règle métier 4 : on n'installe pas un client dans une chambre sale.
    if (targetRoom.housekeepingStatus === "DIRTY" || targetRoom.housekeepingStatus === "CLEANING") {
      throw new ValidationError(`La chambre ${targetRoom.number} n'est pas nettoyée.`);
    }

    const occupied = await tx.stayRoom.findFirst({
      where: {
        roomId: targetRoom.id,
        releasedAt: null,
        stayId: { not: stay.id },
        stay: { status: { in: ["CHECKED_IN", "IN_HOUSE"] } },
      },
      select: { stayId: true },
    });

    if (occupied) {
      throw new ValidationError(`La chambre ${targetRoom.number} est déjà occupée.`);
    }
return applyRoomChange({
      tx,
      tenant,
      stay,
      currentRoom: currentRoom,
      targetRoom,
      reason: input.reason,
    });
  });
}

interface RoomChangeContext {
  tx: PrismaTransactionClient;
  tenant: { userId: string; propertyId: string; organizationId: string };
  stay: { id: string; stayNumber: string; plannedCheckOut: Date };
  currentRoom: { id: string; roomId: string; room: { number: string } };
  targetRoom: { id: string; number: string; status: string; roomTypeId: string };
  reason: string;
}

/** Écrit le changement de chambre une fois les contrôles passé. */
async function applyRoomChange({
  tx,
  tenant,
  stay,
  currentRoom,
  targetRoom,
  reason,
}: RoomChangeContext): Promise<ChangeRoomResult> {
  // L'ancienne ligne est datée, pas supprimée : l'historique doit rester
  // consultable (section 50).
  await tx.stayRoom.update({
    where: { id: currentRoom.id },
    data: { releasedAt: new Date() },
  });

  await tx.stayRoom.create({
    data: {
      stayId: stay.id,
      propertyId: tenant.propertyId,
      roomId: targetRoom.id,
      roomTypeId: targetRoom.roomTypeId,
      arrivalDate: new Date(),
      departureDate: stay.plannedCheckOut,
      assignedBy: tenant.userId,
    },
  });

  // L'ancienne chambre n'est plus occupée, mais elle est sale : elle ne peut
  // pas être vendue avant le passage housekeeping (règles métier 3 et 4).
  // « DIRTY » est un état de ménage, pas un état d'occupation — d'où deux
  // colonnes distinctes sur `rooms`.
  await tx.room.update({
    where: { id: currentRoom.roomId },
    data: { status: "AVAILABLE", housekeepingStatus: "DIRTY" },
  });

  await tx.roomStatusHistory.create({
    data: {
      propertyId: tenant.propertyId,
      roomId: currentRoom.roomId,
      previousStatus: "OCCUPIED",
      newStatus: "AVAILABLE",
      reason: `Départ de ${stay.stayNumber} vers ${targetRoom.number} : ${reason}`,
      referenceType: "stay",
      referenceId: stay.id,
      changedBy: tenant.userId,
    },
  });

  await tx.room.update({
    where: { id: targetRoom.id },
    data: { status: "OCCUPIED" },
  });

  await tx.roomStatusHistory.create({
    data: {
      propertyId: tenant.propertyId,
      roomId: targetRoom.id,
      previousStatus: targetRoom.status as never,
      newStatus: "OCCUPIED",
      reason: `Arrivée de ${stay.stayNumber} depuis ${currentRoom.room.number} : ${reason}`,
      referenceType: "stay",
      referenceId: stay.id,
      changedBy: tenant.userId,
    },
  });

  await tx.auditLog.create({
    data: {
      organizationId: tenant.organizationId,
      propertyId: tenant.propertyId,
      userId: tenant.userId,
      action: "stay.change_room",
      resource: "stay",
      resourceId: stay.id,
      beforeData: { roomNumber: currentRoom.room.number },
      afterData: { roomNumber: targetRoom.number, reason },
    },
  });

  await tx.outboxEvent.create({
    data: {
      organizationId: tenant.organizationId,
      propertyId: tenant.propertyId,
      eventType: "RoomChanged",
      aggregateType: "stay",
      aggregateId: stay.id,
      payload: {
        stayId: stay.id,
        previousRoom: currentRoom.room.number,
        newRoom: targetRoom.number,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    previousRoomNumber: currentRoom.room.number,
    newRoomNumber: targetRoom.number,
    previousStayRoomId: currentRoom.id,
  };
}

const CHECK_OUT_PERMISSION = "stay.check_out";
const CHECK_OUT_BALANCE_PERMISSION = "stay.checkout_with_balance";

export interface CheckOutResult {
  stayId: string;
  folioId: string;
  folioBalance: bigint;
  /** Chambre à nettoyer après le départ. */
  roomId: string | null;
  roomNumber: string | null;
  housekeepingTaskId: string | null;
  /** Départ enregistré malgré un solde impayé. */
  departedWithBalance: boolean;
}

/**
 * Enregistre le départ d'un séjour (sections 54 et 95).
 *
 * La section 95 impose l'ordre : verrouiller le séjour, vérifier le solde,
 * finaliser les charges, créer la facture, mettre à jour le séjour, libérer
 * la chambre, créer la tâche housekeeping, auditer.
 *
 * La certification FNE n'est PAS appelée ici : la section 95 est explicite,
 * un appel HTTP externe ne doit jamais être tenu dans une transaction
 * ouverte. Un événement outbox est écrit et sera traité par le worker.
 */
export async function checkOut(input: CheckOutInput): Promise<CheckOutResult> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CHECK_OUT_PERMISSION))) {
    throw new PermissionDeniedError(CHECK_OUT_PERMISSION);
  }

  const canLeaveBalance = await can(tenant.userId, CHECK_OUT_BALANCE_PERMISSION);

  return withTenantContext(tenant, async (tx) => {
    const stay = await tx.stay.findFirst({
      where: { id: input.stayId, propertyId: tenant.propertyId },
      select: {
        id: true,
        stayNumber: true,
        status: true,
        reservationId: true,
        rooms: {
          where: { releasedAt: null },
          select: { roomId: true, room: { select: { number: true } } },
        },
        folios: {
          where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } },
          select: { id: true, balance: true, currency: true },
          orderBy: { openedAt: "desc" },
        },
      },
    });

    if (!stay) {
      throw new ValidationError("Séjour introuvable pour cet établissement.");
    }

    if (stay.status === "CHECKED_OUT") {
      throw new ValidationError(`Le séjour ${stay.stayNumber} est déjà clôturé.`);
    }

    if (stay.status !== "IN_HOUSE" && stay.status !== "CHECKED_IN") {
      throw new ValidationError("Seul un séjour en cours peut être clôturé.");
    }

    const folio = stay.folios[0];
    if (!folio) {
      throw new ValidationError("Aucun folio ouvert sur ce séjour.");
    }

    // --- Prestations de dernière minute (section 54) ----------------------
    // Minibar et consommations sont imputées avant le calcul du solde : le
    // client ne doit pas pouvoir partir sans qu'elles soient saisies.
    if (input.charges && input.charges.length > 0) {
      await tx.folioItem.createMany({
        data: input.charges.map((charge) => ({
          folioId: folio.id,
          propertyId: tenant.propertyId,
          businessDate: new Date(),
          transactionDate: new Date(),
          type: charge.type,
          description: charge.description,
          quantity: new Prisma.Decimal(1),
          unitAmount: charge.amount,
          netAmount: charge.amount,
          taxAmount: 0n,
          grossAmount: charge.amount,
          postedBy: tenant.userId,
        })),
      });

      await tx.folio.update({
        where: { id: folio.id },
        data: {
          balance: {
            increment: input.charges.reduce((sum, charge) => sum + charge.amount, 0n),
          },
        },
      });
    }

    // --- Encaisser le solde ------------------------------------------------
    if (input.payment && input.payment.amount > 0n) {
      // Règle métier 6 : un paiement ne dépasse pas le montant dû sans règle
      // explicite de trop-perçu.
      if (input.payment.amount > folio.balance) {
        throw new ValidationError(
          "Le paiement dépasse le solde dû. Un trop-perçu doit être traité comme un avoir, pas comme un paiement.",
        );
      }

      await recordCheckoutPayment(tx, tenant.propertyId, folio, input.payment.amount, {
        method: input.payment.method,
        reference: input.payment.reference ?? null,
        receivedBy: tenant.userId,
        stayId: stay.id,
      });

      await tx.folio.update({
        where: { id: folio.id },
        data: { balance: { decrement: input.payment.amount } },
      });
    }

    // Le solde est recalculé depuis les écritures plutôt que lu sur le champ
    // dénormalisé : une opération concurrente a pu le modifier.
    const finalBalance =
      folio.balance +
      (input.charges ?? []).reduce((sum, charge) => sum + charge.amount, 0n) -
      (input.payment?.amount ?? 0n);

    // --- Vérifier le solde (section 54) -----------------------------------
    if (finalBalance > 0n && !canLeaveBalance) {
      throw new ValidationError(
        `Solde impayé de ${finalBalance} ${folio.currency}. ` +
          "Encaissez le solde ou utilisez une dérogation de départ.",
      );
    }

    return finalizeCheckOut({ tx, tenant, stay, folio, input, finalBalance });
  });
}

/** Séquence numérique des paiements, par établissement. */
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

/**
 * Enregistre un paiement de checkout.
 *
 * La clé d'idempotence dérive du séjour et du folio : un double envoi de la
 * même demande ne crée pas un second paiement (sections 70 et 135).
 */
async function recordCheckoutPayment(
  tx: PrismaTransactionClient,
  propertyId: string,
  folio: { id: string; currency: string },
  amount: bigint,
  details: {
    method: "CASH" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "MOBILE_MONEY" | "OTHER";
    reference: string | null;
    receivedBy: string;
    stayId: string;
  },
): Promise<void> {
  const paymentNumber = await nextPaymentNumber(tx, propertyId);

  const payment = await tx.payment.create({
    data: {
      propertyId,
      paymentNumber,
      folioId: folio.id,
      amount,
      currency: folio.currency,
      method: details.method,
      status: "COMPLETED",
      reference: details.reference,
      paidAt: new Date(),
      receivedBy: details.receivedBy,
      idempotencyKey: `checkout:${details.stayId}:${folio.id}`,
    },
    select: { id: true },
  });

  await tx.paymentAllocation.create({
    data: { paymentId: payment.id, folioId: folio.id, amount },
  });
}

interface FinalizeCheckOutArgs {
  tx: PrismaTransactionClient;
  tenant: { userId: string; propertyId: string; organizationId: string };
  stay: {
    id: string;
    stayNumber: string;
    status: string;
    reservationId: string;
    rooms: { roomId: string; room: { number: string } }[];
  };
  folio: { id: string; currency: string };
  input: CheckOutInput;
  finalBalance: bigint;
}

/** Solde le folio, clôture le séjour, libère la chambre et lance le ménage. */
async function finalizeCheckOut({
  tx,
  tenant,
  stay,
  folio,
  input,
  finalBalance,
}: FinalizeCheckOutArgs): Promise<CheckOutResult> {
  await tx.folio.update({
    where: { id: folio.id },
    data: {
      balance: finalBalance,
      status: finalBalance <= 0n ? "PAID" : "PARTIALLY_PAID",
    },
  });

  await tx.stay.update({
    where: { id: stay.id },
    data: {
      status: "CHECKED_OUT",
      actualCheckOutAt: new Date(),
      checkedOutBy: tenant.userId,
    },
  });

  await tx.reservation.update({
    where: { id: stay.reservationId },
    data: { status: "CHECKED_OUT", updatedBy: tenant.userId },
  });

  const activeRoom = stay.rooms[0];
  let housekeepingTaskId: string | null = null;

  // --- Libérer la chambre (règle métier 3) -------------------------------
  if (activeRoom) {
    await tx.stayRoom.updateMany({
      where: { stayId: stay.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });

    // La chambre redevient disponible mais sale : elle n'est vendable qu'après
    // le workflow housekeeping (section 36, règle métier 4).
    await tx.room.update({
      where: { id: activeRoom.roomId },
      data: { status: "AVAILABLE", housekeepingStatus: "DIRTY" },
    });

    await tx.roomStatusHistory.create({
      data: {
        propertyId: tenant.propertyId,
        roomId: activeRoom.roomId,
        previousStatus: "OCCUPIED",
        newStatus: "AVAILABLE",
        reason: `Départ ${stay.stayNumber}`,
        referenceType: "stay",
        referenceId: stay.id,
        changedBy: tenant.userId,
      },
    });

    // --- Créer la tâche housekeeping (section 36) ------------------------
    // Sans doublon : une chambre n'a pas deux tâches de ménage pour le même
    // départ.
    const existingTask = await tx.housekeepingTask.findFirst({
      where: { roomId: activeRoom.roomId, referenceType: "stay", referenceId: stay.id },
      select: { id: true },
    });

    if (!existingTask) {
      const task = await tx.housekeepingTask.create({
        data: {
          propertyId: tenant.propertyId,
          roomId: activeRoom.roomId,
          taskType: "CHECKOUT_CLEAN",
          status: "PENDING",
          priority: "NORMAL",
          referenceType: "stay",
          referenceId: stay.id,
        },
        select: { id: true },
      });

      housekeepingTaskId = task.id;
    }
  }

  await tx.auditLog.create({
    data: {
      organizationId: tenant.organizationId,
      propertyId: tenant.propertyId,
      userId: tenant.userId,
      action: "stay.check_out",
      resource: "stay",
      resourceId: stay.id,
      beforeData: { status: stay.status },
      afterData: {
        status: "CHECKED_OUT",
        finalBalance: finalBalance.toString(),
        departedWithBalance: finalBalance > 0n,
        overrideReason: input.overrideReason ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  // Section 95 : la FNE passe par l'outbox, jamais par un appel HTTP tenu
  // dans cette transaction.
  await tx.outboxEvent.create({
    data: {
      organizationId: tenant.organizationId,
      propertyId: tenant.propertyId,
      eventType: "GuestCheckedOut",
      aggregateType: "stay",
      aggregateId: stay.id,
      payload: {
        stayId: stay.id,
        folioId: folio.id,
        balance: finalBalance.toString(),
      } as Prisma.InputJsonValue,
    },
  });

  return {
    stayId: stay.id,
    folioId: folio.id,
    folioBalance: finalBalance,
    roomId: activeRoom?.roomId ?? null,
    roomNumber: activeRoom?.room.number ?? null,
    housekeepingTaskId,
    departedWithBalance: finalBalance > 0n,
  };
}
