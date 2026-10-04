import "server-only";

import { prisma } from "@/lib/db";
import { getTenantContext } from "@/modules/tenancy/context";

/**
 * Données de l'écran de réception (PROMPTMVP.md section 61).
 *
 * La réception est l'écran le plus ouvert de la journée : la réceptionniste
 * doit voir, en un coup d'œil, qui arrive, qui part, combien de chambres sont
 * vendues et lesquelles sont sales. Ce module ne contient que des lectures —
 * aucune décision métier n'est prise ici. Les arrivées et départs affichés
 * sont ceux qui figurent déjà dans le système ; les actions (check-in,
 * check-out) passent par leurs services dédiés.
 *
 * Toutes les requêtes sont bornées par `tenant.propertyId`, issu de la session
 * et jamais d'un paramètre d'URL (section 7).
 */

export interface ArrivalRow {
  reservationId: string;
  reservationNumber: string;
  guestName: string;
  guestPhone: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  roomTypeName: string | null;
  roomNumber: string | null;
  status: string;
  isVip: boolean;
  hasDeposit: boolean;
}

export interface DepartureRow {
  stayId: string;
  stayNumber: string;
  guestName: string;
  guestPhone: string | null;
  departureDate: string;
  roomNumber: string | null;
  status: string;
  actualCheckInAt: string | null;
}

export interface RoomStateSummary {
  total: number;
  occupied: number;
  available: number;
  dirty: number;
  clean: number;
  outOfOrder: number;
}

export interface InHouseRow {
  stayId: string;
  stayNumber: string;
  guestName: string;
  roomNumber: string | null;
  plannedCheckOut: string;
  balanceDue: bigint;
  currency: string;
}

export interface FrontDeskSnapshot {
  businessDate: Date;
  currency: string;
  arrivals: ArrivalRow[];
  departures: DepartureRow[];
  inHouse: InHouseRow[];
  rooms: RoomStateSummary;
}


/**
 * Construit l'instantané de la réception pour la journée courante de
 * l'établissement.
 */
export async function loadFrontDeskSnapshot(): Promise<FrontDeskSnapshot> {
  const tenant = await getTenantContext();

  // La date métier vient de l'établissement, pas du serveur : un hôtel qui
  // ouvre sa journée à 3 h ne doit pas basculer sur l'heure UTC (section 25).
  //
  // La lecture doit se faire dans une transaction portant le contexte RLS :
  // `properties` est protégée par `organization_isolation` et ne renvoie rien
  // si `app.organization_id` est absent. C'est aussi l'occasion de fixer
  // `app.property_id`, dont les tables opérationnelles (chambres, tarifs) ont
  // besoin pour être lisibles.
  const { businessDate, currency } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${tenant.organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${tenant.propertyId}, true)`;

    return tx.property.findUniqueOrThrow({
      where: { id: tenant.propertyId },
      select: { businessDate: true, currency: true },
    });
  });

  const startOfDay = new Date(businessDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  // Toutes les lectures suivantes partagent le contexte RLS posé ci-dessus :
  // réservations, séjours et chambres sont des tables opérationnelles, elles
  // ne renvoient rien sans `app.organization_id` et `app.property_id`.
  const { arrivals, departures, inHouse, roomGroups } = await prisma.$transaction(async (tx) => {
    const [arrivals, departures, inHouse, roomGroups] = await Promise.all([
    // Arrivées du jour : réservations non annulées.
    tx.reservation.findMany({
      where: {
        propertyId: tenant.propertyId,
        arrivalDate: { gte: startOfDay, lt: endOfDay },
        status: { in: ["CONFIRMED", "OPTION", "CHECKED_IN"] },
      },
      select: {
        id: true,
        reservationNumber: true,
        arrivalDate: true,
        departureDate: true,
        nights: true,
        adults: true,
        depositRequired: true,
        depositAmount: true,
        status: true,
        guest: {
          select: { firstName: true, lastName: true, phone: true, vipLevel: true },
        },
        rooms: {
          select: {
            room: { select: { number: true } },
            roomType: { select: { name: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ arrivalDate: "asc" }, { reservationNumber: "asc" }],
      take: 200,
    }),

    // Départs du jour.
    tx.stay.findMany({
      where: {
        propertyId: tenant.propertyId,
        plannedCheckOut: { gte: startOfDay, lt: endOfDay },
        status: { in: ["CHECKED_IN", "EXPECTED"] },
      },
      select: {
        id: true,
        stayNumber: true,
        plannedCheckOut: true,
        actualCheckInAt: true,
        status: true,
        primaryGuest: { select: { firstName: true, lastName: true, phone: true } },
        rooms: { select: { room: { select: { number: true } } }, take: 1 },
      },
      orderBy: [{ plannedCheckOut: "asc" }],
      take: 200,
    }),

    // Clients présents : le solde permet de savoir qui doit être relancé.
    tx.stay.findMany({
      where: {
        propertyId: tenant.propertyId,
        status: "CHECKED_IN",
        plannedCheckOut: { gte: endOfDay },
      },
      select: {
        id: true,
        stayNumber: true,
        plannedCheckOut: true,
        primaryGuest: { select: { firstName: true, lastName: true } },
        rooms: { select: { room: { select: { number: true } } }, take: 1 },
        folios: {
          // `balance` est dénormalisé et recalculé dans la même transaction
          // que les écritures (section 24). Le lire évite d'agréger les lignes
          // à chaque affichage, et le calcul reste le fait unique du service.
          select: { currency: true, balance: true, creditBalance: true },
          take: 1,
        },
      },
      orderBy: [{ plannedCheckOut: "asc" }],
      take: 100,
    }),

    // Répartition des chambres : un regroupement suffit, inutile de charger
    // chaque ligne.
    tx.room.groupBy({
      by: ["status", "housekeepingStatus"],
      where: { propertyId: tenant.propertyId, deletedAt: null },
      _count: { _all: true },
    }),
    ]);

    return { arrivals, departures, inHouse, roomGroups };
  });

  const rooms: RoomStateSummary = {
    total: 0,
    occupied: 0,
    available: 0,
    dirty: 0,
    clean: 0,
    outOfOrder: 0,
  };

  for (const group of roomGroups) {
    const count = group._count._all;
    rooms.total += count;

    if (group.status === "OCCUPIED") {
      rooms.occupied += count;
    } else if (group.status === "AVAILABLE") {
      rooms.available += count;
    } else if (group.status === "OUT_OF_ORDER") {
      rooms.outOfOrder += count;
    }

    if (group.housekeepingStatus === "DIRTY") {
      rooms.dirty += count;
    } else if (group.housekeepingStatus === "CLEAN") {
      rooms.clean += count;
    }
  }

  return {
    businessDate,
    currency,
    arrivals: arrivals.map((reservation) => ({
      reservationId: reservation.id,
      reservationNumber: reservation.reservationNumber,
      guestName: `${reservation.guest.firstName} ${reservation.guest.lastName}`,
      guestPhone: reservation.guest.phone,
      arrivalDate: dayOnly(reservation.arrivalDate),
      departureDate: dayOnly(reservation.departureDate),
      nights: reservation.nights,
      adults: reservation.adults,
      roomTypeName: reservation.rooms[0]?.roomType?.name ?? null,
      roomNumber: reservation.rooms[0]?.room?.number ?? null,
      status: reservation.status,
      isVip: reservation.guest.vipLevel !== "NONE",
      // Un dépôt exigé mais non versé est un risque de refus à l'arrivée :
      // le signal doit être visible avant le check-in.
      hasDeposit: reservation.depositRequired && reservation.depositAmount <= 0n,
    })),
    departures: departures.map((stay) => ({
      stayId: stay.id,
      stayNumber: stay.stayNumber,
      guestName: `${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}`,
      guestPhone: stay.primaryGuest.phone,
      departureDate: dayOnly(stay.plannedCheckOut),
      roomNumber: stay.rooms[0]?.room?.number ?? null,
      status: stay.status,
      actualCheckInAt: stay.actualCheckInAt?.toISOString() ?? null,
    })),
    inHouse: inHouse.map((stay) => {
      const folio = stay.folios[0];

      return {
        stayId: stay.id,
        stayNumber: stay.stayNumber,
        guestName: `${stay.primaryGuest.firstName} ${stay.primaryGuest.lastName}`,
        roomNumber: stay.rooms[0]?.room?.number ?? null,
        plannedCheckOut: dayOnly(stay.plannedCheckOut),
        balanceDue: folio?.balance ?? 0n,
        currency: folio?.currency ?? "XOF",
      };
    }),
    rooms,
  };
}


const dayOnly = (value: Date): string => value.toISOString().slice(0, 10);
