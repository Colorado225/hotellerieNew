import "server-only";

import { Prisma } from "@prisma/client";

import { withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { computeAvailability } from "@/modules/availability/engine";
import { can } from "@/modules/permissions/service";
import {
  CapacityExceededError,
  PermissionDeniedError,
  RoomNotAvailableError,
  ValidationError,
} from "@/modules/shared/errors";
import { getTenantContext } from "@/modules/tenancy/context";
import { applyDiscount, countNights, MissingRateError } from "@/modules/rates/engine";
import { loadRateCandidates } from "@/modules/rates/loader";

import type { CreateReservationInput } from "./schemas";

/**
 * Service de réservation (PROMPTMVP.md sections 18, 44 et 45).
 *
 * La création est intégralement transactionnelle et s'exécute en isolation
 * `Serializable`. C'est la seule façon de traiter correctement deux
 * réservations simultanées sur la dernière chambre : la seconde doit
 * échouer avec une erreur métier contrôlée, jamais aboutir par hasard.
 *
 * L'ordre des opérations à l'intérieur de la transaction est significatif :
 * on vérifie l'inventaire avant d'écrire quoi que ce soit.
 */

const CREATE_PERMISSION = "reservation.create";
const OVERRIDE_PRICE_PERMISSION = "reservation.override_price";

/**
 * Numéro de réservation lisible et séquentiel par établissement.
 *
 * Le format `RES-AAAAMM-NNNNN` est lisible par un humain, ce qui compte
 * lorsqu'un client lit son numéro au téléphone. Le compteur est obtenu dans
 * la transaction pour rester atomique.
 */
async function nextReservationNumber(tx: PrismaTransactionClient, propertyId: string): Promise<string> {
  const latest = await tx.reservation.findFirst({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    select: { reservationNumber: true },
  });

  const prefix = new Date().toISOString().slice(0, 7).replace("-", "");

  let sequence = 1;
  if (latest) {
    const match = latest.reservationNumber.match(/-(\d+)$/);
    if (match) {
      sequence = Number.parseInt(match[1], 10) + 1;
    }
  }

  return `RES-${prefix}-${String(sequence).padStart(5, "0")}`;
}

interface ReservationLineTotals {
  baseAmount: bigint;
  discountAmount: bigint;
  totalAmount: bigint;
  nights: number;
}

/**
 * Calcule le prix d'une ligne de réservation.
 *
 * La remise n'est appliquée qu'après contrôle de la permission dédiée : une
 * remise non justifiée ne doit jamais atteindre la base, même si la saisie
 * est valide.
 */
async function priceLine(
  tx: PrismaTransactionClient,
  propertyId: string,
  line: CreateReservationInput["rooms"][number],
  canOverridePrice: boolean,
): Promise<ReservationLineTotals> {
  const nights = countNights(line.arrivalDate, line.departureDate);

  const candidates = await loadRateCandidates(
    tx,
    propertyId,
    line.roomTypeId,
    line.ratePlanId,
    line.arrivalDate,
    line.departureDate,
  );

  let baseAmount: bigint;
  try {
    const { computeRoomSubtotal } = await import("@/modules/rates/engine");
    baseAmount = computeRoomSubtotal(
      candidates,
      line.arrivalDate,
      line.departureDate,
      line.adults + line.children,
    ).roomSubtotal;
  } catch (error) {
    if (error instanceof MissingRateError) {
      throw new ValidationError(
        "Aucun tarif n'est configuré pour ce type de chambre sur cette période.",
        { roomTypeId: line.roomTypeId },
      );
    }
    throw error;
  }

  // Une remise exige la permission dédiée, même si la saisie est valide.
  if (line.discount && line.discount.value > 0n && !canOverridePrice) {
    throw new PermissionDeniedError(OVERRIDE_PRICE_PERMISSION);
  }

  const { netAmount, applied } = applyDiscount(
    baseAmount,
    line.discount ? { type: line.discount.type, value: line.discount.value } : null,
  );

  return {
    baseAmount,
    discountAmount: applied?.amount ?? 0n,
    totalAmount: netAmount,
    nights,
  };
}

export interface CreatedReservation {
  id: string;
  reservationNumber: string;
  status: string;
  arrivalDate: Date;
  departureDate: Date;
  nights: number;
  subtotal: bigint;
  discountAmount: bigint;
  totalAmount: bigint;
  rooms: {
    id: string;
    roomTypeId: string;
    roomId: string | null;
    baseAmount: bigint;
    discountAmount: bigint;
    totalAmount: bigint;
  }[];
}

/**
 * Crée une réservation (sections 18, 44 et 45).
 *
 * Tout se joue dans une transaction `Serializable` :
 *
 *   1. on vérifie les permissions ;
 *   2. on relit l'inventaire disponible DANS la transaction ;
 *   3. on refuse si le type de chambre demandé est épuisé ;
 *   4. on calcule les prix à partir des grilles tarifaires ;
 *   5. on écrit la réservation, ses lignes et sa trace d'audit.
 *
 * L'inventaire est relu à l'intérieur de la transaction, jamais avant : le
 * lire avant ouvrirait une fenêtre où deux réservations concurrentes
 * verraient la même dernière chambre libre. Deux requêtes simultanées se
 * sérialisent alors, et la seconde reçoit `RoomNotAvailableError` au lieu
 * de réussir par hasard.
 */
export async function createReservation(input: CreateReservationInput): Promise<CreatedReservation> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, CREATE_PERMISSION))) {
    throw new PermissionDeniedError(CREATE_PERMISSION);
  }

  const canOverridePrice = await can(tenant.userId, OVERRIDE_PRICE_PERMISSION);
  const firstRoom = input.rooms[0];
  const arrivalDate = firstRoom.arrivalDate;
  const departureDate = firstRoom.departureDate;
  const nights = countNights(arrivalDate, departureDate);

  return withTenantContext(tenant, async (tx) => {
    // 2. Disponibilité par type demandé, relue dans la transaction.
    const availability = await computeAvailability(tx, {
      propertyId: tenant.propertyId,
      arrivalDate,
      departureDate,
      adults: input.adults,
      children: input.children,
    });

    const requestedByType = new Map<string, number>();
    for (const room of input.rooms) {
      requestedByType.set(room.roomTypeId, (requestedByType.get(room.roomTypeId) ?? 0) + 1);
    }

    for (const [roomTypeId, requested] of requestedByType) {
      const entry = availability.roomTypes.find((item) => item.roomType.id === roomTypeId);

      if (!entry) {
        throw new RoomNotAvailableError();
      }

      const lineOccupancy = input.rooms
        .filter((room) => room.roomTypeId === roomTypeId)
        .reduce((sum, room) => sum + room.adults + room.children, 0);

      if (lineOccupancy > entry.roomType.maxOccupancy * requested) {
        throw new CapacityExceededError(lineOccupancy, entry.roomType.maxOccupancy * requested);
      }

      // Le refus précède toute écriture : une réservation refusée ne doit
      // laisser aucune trace d'inventaire.
      if (entry.availableRooms < requested) {
        throw new RoomNotAvailableError(entry.roomType.name);
      }
    }

    // 3. Tarification ligne par ligne.
    const pricedLines = [];
    for (const room of input.rooms) {
      pricedLines.push({
        room,
        totals: await priceLine(tx, tenant.propertyId, room, canOverridePrice),
      });
    }

    const subtotal = pricedLines.reduce((sum, line) => sum + line.totals.baseAmount, 0n);
    const discountAmount = pricedLines.reduce((sum, line) => sum + line.totals.discountAmount, 0n);
    const totalAmount = pricedLines.reduce((sum, line) => sum + line.totals.totalAmount, 0n);

    return writeReservation({
      tx,
      tenant,
      input,
      arrivalDate,
      departureDate,
      nights,
      subtotal,
      discountAmount,
      totalAmount,
      pricedLines,
    });
  });
}

interface PricedLine {
  room: CreateReservationInput["rooms"][number];
  totals: ReservationLineTotals;
}

interface WriteReservationArgs {
  tx: PrismaTransactionClient;
  tenant: { userId: string; propertyId: string; organizationId: string };
  input: CreateReservationInput;
  arrivalDate: Date;
  departureDate: Date;
  nights: number;
  subtotal: bigint;
  discountAmount: bigint;
  totalAmount: bigint;
  pricedLines: PricedLine[];
}

/**
 * Écrit la réservation, ses lignes, son audit et son événement de domaine.
 *
 * Isolée de `createReservation` pour que la fonction appelante reste
 * centrée sur la décision : vérifier, tarifer, puis déléguer l'écriture.
 */
async function writeReservation({
  tx,
  tenant,
  input,
  arrivalDate,
  departureDate,
  nights,
  subtotal,
  discountAmount,
  totalAmount,
  pricedLines,
}: WriteReservationArgs): Promise<CreatedReservation> {
  const reservationNumber = await nextReservationNumber(tx, tenant.propertyId);

  const reservation = await tx.reservation.create({
    data: {
      propertyId: tenant.propertyId,
      reservationNumber,
      source: input.source,
      channel: input.channel ?? null,
      // Une réservation naît toujours en brouillon : la confirmation est une
      // décision métier distincte (section 44).
      status: "DRAFT",
      guestId: input.guestId,
      companyId: input.companyId ?? null,
      agencyId: input.agencyId ?? null,
      arrivalDate,
      departureDate,
      nights,
      adults: input.adults,
      children: input.children,
      infants: input.infants,
      currency: "XOF",
      subtotal,
      discountAmount,
      taxAmount: 0n,
      totalAmount,
      depositRequired: input.depositRequired,
      specialRequests: input.specialRequests ?? null,
      internalNotes: input.internalNotes ?? null,
      externalReference: input.externalReference ?? null,
      createdBy: tenant.userId,
      updatedBy: tenant.userId,
    },
    select: { id: true, reservationNumber: true, status: true },
  });

  const createdRooms = [];
  for (const { room, totals } of pricedLines) {
    createdRooms.push(
      await tx.reservationRoom.create({
        data: {
          reservationId: reservation.id,
          propertyId: tenant.propertyId,
          roomTypeId: room.roomTypeId,
          roomId: room.roomId ?? null,
          ratePlanId: room.ratePlanId,
          adults: room.adults,
          children: room.children,
          arrivalDate: room.arrivalDate,
          departureDate: room.departureDate,
          numberOfNights: totals.nights,
          baseAmount: totals.baseAmount,
          discountAmount: totals.discountAmount,
          taxAmount: 0n,
          totalAmount: totals.totalAmount,
          discountType: room.discount?.type ?? null,
          discountValue: room.discount?.value ?? null,
          discountReason: room.discount?.reason ?? null,
          discountApprovedBy: room.discount ? tenant.userId : null,
        },
        select: {
          id: true,
          roomTypeId: true,
          roomId: true,
          baseAmount: true,
          discountAmount: true,
          totalAmount: true,
        },
      }),
    );
  }

  await tx.reservationGuest.createMany({
    data: [
      { reservationId: reservation.id, guestId: input.guestId, role: "PRIMARY", isPrimary: true },
      ...(input.additionalGuests ?? []).map((guest) => ({
        reservationId: reservation.id,
        guestId: guest.guestId,
        role: guest.role,
        isPrimary: false,
      })),
    ],
  });

  // Audit et événement de domaine dans la même transaction : si l'écriture
  // échoue, aucune trace ne subsiste.
  await tx.auditLog.create({
    data: {
      organizationId: tenant.organizationId,
      propertyId: tenant.propertyId,
      userId: tenant.userId,
      action: "reservation.create",
      resource: "reservation",
      resourceId: reservation.id,
      afterData: {
        reservationNumber,
        nights,
        totalAmount: totalAmount.toString(),
        rooms: createdRooms.length,
      } as Prisma.InputJsonValue,
    },
  });

  await tx.outboxEvent.create({
    data: {
      organizationId: tenant.organizationId,
      propertyId: tenant.propertyId,
      eventType: "ReservationCreated",
      aggregateType: "reservation",
      aggregateId: reservation.id,
      payload: { reservationId: reservation.id, reservationNumber } as Prisma.InputJsonValue,
    },
  });

  return {
    id: reservation.id,
    reservationNumber: reservation.reservationNumber,
    status: reservation.status,
    arrivalDate,
    departureDate,
    nights,
    subtotal,
    discountAmount,
    totalAmount,
    rooms: createdRooms,
  };
}
