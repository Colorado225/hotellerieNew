import type { RoomStatus, RoomType } from "@prisma/client";

import type { PrismaTransactionClient } from "@/lib/db";

/**
 * Moteur de disponibilité (PROMPTMVP.md section 45).
 *
 * Règle fondamentale : le système compte les chambres RÉELLEMENT
 * disponibles, pas simplement celles qui ne sont pas occupées.
 *
 * Une chambre est indisponible si elle est dans l'un de ces états :
 *   RESERVED, OCCUPIED, BLOCKED, OUT_OF_ORDER, OUT_OF_SERVICE, MAINTENANCE
 *
 * S'y ajoute une contrainte que le cahier des charges ne mentionne pas
 * explicitement mais qui découle de la section 36 : une chambre dont le
 * ménage n'est pas terminé n'est pas vendable, même si elle est inoccupée.
 * Sans cette règle, le PMS promet au client une chambre encore sale.
 */

/** États de chambre qui retirent une chambre de l'inventaire vendable. */
export const UNAVAILABLE_ROOM_STATUSES: readonly RoomStatus[] = [
  "RESERVED",
  "OCCUPIED",
  "BLOCKED",
  "OUT_OF_ORDER",
  "OUT_OF_SERVICE",
  "MAINTENANCE",
];

/** États de ménage qui interdisent la vente. */
export const UNSELLABLE_HOUSEKEEPING_STATUSES = ["DIRTY", "CLEANING"] as const;

export interface AvailabilityQuery {
  propertyId: string;
  roomTypeId?: string | null;
  /** Date d'arrivée, incluse. */
  arrivalDate: Date;
  /** Date de départ, exclusive. */
  departureDate: Date;
  adults?: number;
  children?: number;
}

export interface RoomTypeAvailability {
  roomType: Pick<RoomType, "id" | "name" | "code" | "maxOccupancy" | "baseOccupancy">;
  totalRooms: number;
  /** Chambres retirées pour une raison permanente (panne, blocage). */
  outOfOrderRooms: number;
  /** Chambres consommées sur la période. */
  committedRooms: number;
  /** Chambres retenues par un ménage non terminé. */
  blockedByHousekeeping: number;
  /** Inventaire réellement vendable : ce que le moteur affiche. */
  availableRooms: number;
  /** Réservations au-delà de la capacité physique, à signaler. */
  oversold: number;
}

export interface AvailabilityResult {
  arrivalDate: Date;
  departureDate: Date;
  nights: number;
  roomTypes: RoomTypeAvailability[];
  totalAvailable: number;
}

/** Deux intervalles semi-ouverts [a, b) et [c, d) se chevauchent-ils ? */
export function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  // Le format semi-ouvert évite qu'une réservation dont le départ est le
  // jour de l'arrivée d'une autre soit comptée comme en conflit.
  return startA < endB && startB < endA;
}

/** Ramène une date à minuit UTC. */
export function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Nombre de nuits entre l'arrivée et le départ. */
export function countNightsBetween(arrivalDate: Date, departureDate: Date): number {
  return Math.round((dayStart(departureDate).getTime() - dayStart(arrivalDate).getTime()) / 86_400_000);
}

export interface CommittedInventory {
  /** Chambres physiques effectivement affectées sur la période. */
  committedRoomIds: Set<string>;
  /** Consommation par type de chambre, toutes affectations confondues. */
  committedCountByType: Map<string, number>;
}

/**
 * Relève l'inventaire engagé sur une période.
 *
 * Deux sources sont combinées, et c'est indispensable :
 *
 * 1. `stay_rooms` : les séjours en cours, avec leur chambre physique.
 * 2. `reservation_rooms` : les réservations confirmées, avec ou sans
 *    chambre affectée.
 *
 * La seconde source est celle qui empêche le surbooking : dix réservations
 * sur un type de chambre ne portant qu'une seule chambre physique ne
 * peuvent pas toutes être servies. Ne compter que les chambres affectées
 * laisserait passer ces dix réservations.
 */
export async function loadCommittedInventory(
  tx: PrismaTransactionClient,
  propertyId: string,
  roomIds: readonly string[],
  arrivalDate: Date,
  departureDate: Date,
): Promise<CommittedInventory> {
  const overlapping = {
    propertyId,
    // La période réservée doit chevaucher la période demandée.
    arrivalDate: { lt: departureDate },
    departureDate: { gt: arrivalDate },
  };

  const [reservationRooms, stayRooms] = await Promise.all([
    tx.reservationRoom.findMany({
      where: {
        ...overlapping,
        status: { in: ["RESERVED", "OCCUPIED"] },
      },
      select: { roomId: true, roomTypeId: true },
    }),
    tx.stayRoom.findMany({
      where: {
        ...overlapping,
        releasedAt: null,
        ...(roomIds.length > 0 ? { roomId: { in: [...roomIds] } } : {}),
      },
      select: { roomId: true },
    }),
  ]);

  const committedRoomIds = new Set<string>();
  const committedCountByType = new Map<string, number>();

  for (const row of reservationRooms) {
    if (row.roomId !== null) {
      committedRoomIds.add(row.roomId);
    }
    committedCountByType.set(row.roomTypeId, (committedCountByType.get(row.roomTypeId) ?? 0) + 1);
  }

  for (const row of stayRooms) {
    committedRoomIds.add(row.roomId);
  }

  return { committedRoomIds, committedCountByType };
return { committedRoomIds, committedCountByType };
}

/**
 * Calcule la disponibilité réelle par type de chambre.
 *
 * À appeler dans la transaction du client : la lecture de l'inventaire et la
 * réservation qui suit doivent partager le même état. C'est ce qui permet de
 * traiter correctement deux réservations simultanées sur la dernière chambre.
 */
export async function computeAvailability(
  tx: PrismaTransactionClient,
  query: AvailabilityQuery,
): Promise<AvailabilityResult> {
  const arrivalDate = dayStart(query.arrivalDate);
  const departureDate = dayStart(query.departureDate);
  const nights = countNightsBetween(arrivalDate, departureDate);
  const occupancy = (query.adults ?? 1) + (query.children ?? 0);

  const rooms = await tx.room.findMany({
    where: {
      propertyId: query.propertyId,
      deletedAt: null,
      ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
    },
    select: {
      id: true,
      roomTypeId: true,
      status: true,
      housekeepingStatus: true,
      roomType: {
        select: { id: true, name: true, code: true, maxOccupancy: true, baseOccupancy: true, status: true },
      },
    },
  });

  // Un type inactif n'est pas vendable, même s'il lui reste des chambres.
  const sellableRooms = rooms.filter((room) => room.roomType.status === "ACTIVE");

  const { committedRoomIds, committedCountByType } = await loadCommittedInventory(
    tx,
    query.propertyId,
    sellableRooms.map((room) => room.id),
    arrivalDate,
    departureDate,
  );

  // Regroupement par type de chambre.
  const byRoomType = new Map<string, RoomTypeAvailability>();

  for (const room of sellableRooms) {
    const isOutOfOrder =
      room.status === "OUT_OF_ORDER" ||
      room.status === "OUT_OF_SERVICE" ||
      room.status === "MAINTENANCE";

    const isBlockedByHousekeeping =
      !isOutOfOrder &&
      UNSELLABLE_HOUSEKEEPING_STATUSES.includes(
        room.housekeepingStatus as (typeof UNSELLABLE_HOUSEKEEPING_STATUSES)[number],
      );

    const existing = byRoomType.get(room.roomTypeId);

    if (existing) {
      existing.totalRooms += 1;
      if (isOutOfOrder) existing.outOfOrderRooms += 1;
      if (isBlockedByHousekeeping) existing.blockedByHousekeeping += 1;
      if (committedRoomIds.has(room.id)) existing.committedRooms += 1;
      continue;
    }

    byRoomType.set(room.roomTypeId, {
      roomType: {
        id: room.roomType.id,
        name: room.roomType.name,
        code: room.roomType.code,
        maxOccupancy: room.roomType.maxOccupancy,
        baseOccupancy: room.roomType.baseOccupancy,
      },
      totalRooms: 1,
      outOfOrderRooms: isOutOfOrder ? 1 : 0,
      blockedByHousekeeping: isBlockedByHousekeeping ? 1 : 0,
      committedRooms: committedRoomIds.has(room.id) ? 1 : 0,
      availableRooms: 0,
      oversold: 0,
    });
  }

  for (const availability of byRoomType.values()) {
    // Un type dont la capacité maximale est inférieure à l'occupation
    // demandée n'est pas proposable, même s'il lui reste des chambres.
    if (occupancy > availability.roomType.maxOccupancy) {
      availability.availableRooms = 0;
      continue;
    }

    // La consommation retenue est la plus élevée des deux mesures : compter
    // seulement les chambres affectées sous-estimerait l'engagement, et
    // compter seulement les réservations par type ignorerait les séjours en
    // cours sans réservation correspondante.
    const committedByPhysicalRoom = availability.committedRooms;
    const committedByTypeCount = committedCountByType.get(availability.roomType.id) ?? 0;
    availability.committedRooms = Math.max(committedByPhysicalRoom, committedByTypeCount);

    const usableInventory = availability.totalRooms - availability.outOfOrderRooms;

    availability.availableRooms = Math.max(
      usableInventory - availability.committedRooms - availability.blockedByHousekeeping,
      0,
    );

    // Le surbooking est signalé plutôt que masqué : un écart entre réservations
    // et capacité physique doit remonter au responsable de réception.
    if (availability.committedRooms > usableInventory) {
      availability.oversold = availability.committedRooms - usableInventory;
    }
  }

  const roomTypes = [...byRoomType.values()].filter(
    (availability) => availability.roomType.maxOccupancy >= occupancy,
  );

  return {
    arrivalDate,
    departureDate,
    nights,
    roomTypes,
    totalAvailable: roomTypes.reduce((total, availability) => total + availability.availableRooms, 0),
  };
}