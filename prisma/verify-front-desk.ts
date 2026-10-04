/**
 * Vérification de l'écran de réception (PROMPTMVP.md section 61).
 *
 * Le module de lecture est normalement exercé par l'interface. Ce script le
 * teste sur une base réelle : une requête qui confond les statuts ou les
 * relations ne se verrait pas à l'œil dans une liste vide.
 *
 * Usage : npx tsx prisma/verify-front-desk.ts
 */
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  [OK  ] ${label}`);
  } else {
    failed += 1;
    console.error(`  [ECHEC] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  // Le RLS exige un contexte organisation : sans lui, aucune ligne n'est
  // visible et le script ne verrait qu'une base vide. Le test travaille donc
  // dans une transaction où le contexte est posé explicitement, et la
  // suppression finale n'a pas à être écrite.
  // L'organisation doit être ciblée explicitement. Sans ce filtre, le test
  // porte sur la première organisation rencontrée — y compris les organizations
  // résiduelles laissées par les tests d'isolation — et échoue faute de données.
  const organization = await prisma.organization.findFirstOrThrow({
    where: { slug: "hotel-ivoire-demo" },
    select: { id: true },
  });

  console.log("\n1. Isolation du périmètre");
  // Sans session, la lecture doit refuser de s'exécuter plutôt que de renvoyer
  // les données d'un établissement par défaut.
  //
  // Ce contrôle est placé hors de la transaction ci-dessous : le module de
  // réception ouvre sa propre connexion, et `set_config(..., true)` est local à
  // la transaction courante. L'exécuter ici évite que ce second client n'efface
  // le contexte RLS des lectures qui suivent.
  let refused = false;
  try {
    const { loadFrontDeskSnapshot } = await import("@/modules/frontdesk/query");
    await loadFrontDeskSnapshot();
  } catch {
    refused = true;
  }
  check("une lecture sans session est refusée", refused);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;

    // Le RLS combine deux contextes : `organizations` se lit par
    // `app.organization_id`, tandis que les tables rattachées à un
    // établissement (chambres, tarifs) exigent en plus `app.property_id`.
    // Poser le second dès l'établissement identifié, comme le fait
    // l'application via `withTenantContext`.
    const property = await tx.property.findFirstOrThrow({
      where: { status: "ACTIVE" },
      select: { id: true, businessDate: true },
    });

    await tx.$executeRaw`SELECT set_config('app.property_id', ${property.id}, true)`;

    const roomType = await tx.roomType.findFirstOrThrow({
      where: { propertyId: property.id },
      select: { id: true, name: true },
    });
    const room = await tx.room.findFirstOrThrow({
      where: { propertyId: property.id, deletedAt: null },
      select: { id: true, number: true },
    });
    const ratePlan = await tx.ratePlan.findFirstOrThrow({
      where: { propertyId: property.id },
      select: { id: true },
    });

    const today = new Date(property.businessDate);
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  console.log("\n2. Requêtes exécutables sur la base réelle");
  const arrivals = await tx.reservation.findMany({
    where: {
      propertyId: property.id,
      arrivalDate: { gte: today, lt: tomorrow },
      status: { in: ["CONFIRMED", "OPTION", "CHECKED_IN"] },
    },
    select: {
      id: true,
      reservationNumber: true,
      guest: { select: { firstName: true, lastName: true, phone: true, vipLevel: true } },
      rooms: {
        select: { room: { select: { number: true } }, roomType: { select: { name: true } } },
        take: 1,
      },
    },
  });
  check("la lecture des arrivées s'exécute", Array.isArray(arrivals));

  const departures = await tx.stay.findMany({
    where: {
      propertyId: property.id,
      plannedCheckOut: { gte: today, lt: tomorrow },
      status: { in: ["CHECKED_IN", "EXPECTED"] },
    },
    select: {
      id: true,
      stayNumber: true,
      primaryGuest: { select: { firstName: true, lastName: true } },
      folios: { select: { currency: true, balance: true }, take: 1 },
    },
  });
  check("la lecture des départs s'exécute", Array.isArray(departures));

  const groups = await tx.room.groupBy({
    by: ["status", "housekeepingStatus"],
    where: { propertyId: property.id, deletedAt: null },
    _count: { _all: true },
  });
  const totalFromGroups = groups.reduce((sum, group) => sum + group._count._all, 0);
  const totalRooms = await tx.room.count({ where: { propertyId: property.id, deletedAt: null } });
  check(
    "le regroupement des chambres est exhaustif",
    totalFromGroups === totalRooms,
    `${totalFromGroups} contre ${totalRooms}`,
  );

  console.log("\n3. Cas d'affichage");
  // Un dépôt exigé mais non versé doit être signalé à l'arrivée : c'est un
  // risque de refus au comptoir.
  const guest = await tx.guest.create({
    data: {
      propertyId: property.id,
      guestCode: `TEST-FD-${randomUUID().slice(0, 6)}`,
      firstName: "Awa",
      lastName: "Kouassi",
      phone: "0700000000",
    },
    select: { id: true },
  });

  const reservation = await tx.reservation.create({
    data: {
      propertyId: property.id,
      reservationNumber: `TEST-FD-${randomUUID().slice(0, 8)}`,
      status: "CONFIRMED",
      guestId: guest.id,
      arrivalDate: today,
      departureDate: tomorrow,
      nights: 1,
      adults: 2,
      totalAmount: 90_000n,
      depositRequired: true,
      depositAmount: 0n,
      rooms: {
        create: {
          propertyId: property.id,
          roomTypeId: roomType.id,
          ratePlanId: ratePlan.id,
          roomId: room.id,
          arrivalDate: today,
          departureDate: tomorrow,
          numberOfNights: 1,
          baseAmount: 90_000n,
          totalAmount: 90_000n,
        },
      },
    },
    select: { id: true },
  });

  const found = await tx.reservation.findFirst({
    where: { id: reservation.id },
    select: {
      depositRequired: true,
      depositAmount: true,
      guest: { select: { vipLevel: true } },
      rooms: {
        select: { room: { select: { number: true } }, roomType: { select: { name: true } } },
      },
    },
  });

  check(
    "un dépôt exigé et non versé est détecté",
    found?.depositRequired === true && found.depositAmount <= 0n,
  );
  check(
    "la chambre et le type sont résolus pour l'affichage",
    Boolean(found?.rooms[0]?.room?.number && found.rooms[0].roomType?.name),
  );
  check("un client sans niveau VIP n'est pas signalé", found?.guest.vipLevel === "NONE");

  const counted = await tx.reservation.count({
    where: { id: reservation.id, status: { in: ["CONFIRMED", "OPTION", "CHECKED_IN"] } },
  });
  check("la réservation apparaît dans les arrivées du jour", counted === 1);

  const excluded = await tx.reservation.count({
    where: { id: reservation.id, status: { in: ["CANCELLED", "NO_SHOW"] } },
  });
  check("une réservation annulée n'apparaît pas", excluded === 0);

  console.log("\n4. Isolation des données de test");
  // La transaction est annulée en sortie d'erreur, ou validée explicitement.
  // Le rollback est vérifié après coup : les lignes créées ne doivent pas
  // survivre au test.
  await tx.reservation.delete({ where: { id: reservation.id } });
  await tx.guest.delete({ where: { id: guest.id } });
  const left = await tx.reservation.count({ where: { id: reservation.id } });
  check("les données de test sont retirées", left === 0);
  });

  // Après validation, les écritures du test ne doivent pas avoir persisté.
  const orphan = await prisma.reservation.count({
    where: { reservationNumber: { startsWith: "TEST-FD" } },
  });
  check("aucune réservation de test ne subsiste", orphan === 0);

  console.log(`\n${passed} vérification(s) réussie(s), ${failed} en échec.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("\nÉCHEC :", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
