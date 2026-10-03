import { PrismaClient } from "@prisma/client";

import { computeAvailability, overlaps } from "@/modules/availability/engine";

/**
 * Test de concurrence sur la dernière chambre (PROMPTMVP.md sections 45,
 * 71, 134 et E2E 6).
 *
 * Scénario vérifié :
 *   - un établissement ne contient qu'une seule chambre vendable ;
 *   - deux transactionsessimultanées réservent cette chambre ;
 *   - une seule doit aboutir, l'autre doit échouer par une erreur métier.
 *
 * C'est le test le plus important du PMS : une double réservation sur la
 * dernière chambre est un refus client, pas un bug technique.
 *
 * Usage : npx tsx prisma/verify-double-booking.ts
 */

const prisma = new PrismaClient();

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

interface Scenario {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  guestIds: string[];
}

/** Prépare un établissement ne comportant qu'une seule chambre physique. */
async function prepareScenario(organizationId: string): Promise<Scenario> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

    const property = await tx.property.create({
      data: {
        organizationId,
        name: "Établissement test concurrence",
        code: "DBK",
        slug: `double-booking-${Date.now()}`,
        status: "ACTIVE",
      },
    });

    const roomType = await tx.roomType.create({
      data: {
        propertyId: property.id,
        name: "Chambre unique",
        code: "UNIQ",
        maxOccupancy: 2,
        baseOccupancy: 2,
        defaultRate: 50_000n,
      },
    });

    // Une seule chambre physique : c'est la condition du test.
    await tx.room.create({
      data: {
        propertyId: property.id,
        roomTypeId: roomType.id,
        number: "001",
        code: "UNIQ-001",
      },
    });

    const ratePlan = await tx.ratePlan.create({
      data: { propertyId: property.id, name: "Tarif test", code: "TEST", isPublic: true },
    });

    await tx.ratePlanPrice.create({
      data: {
        propertyId: property.id,
        ratePlanId: ratePlan.id,
        roomTypeId: roomType.id,
        validFrom: new Date("2026-01-01T00:00:00Z"),
        validTo: new Date("2026-12-31T00:00:00Z"),
        occupancy: 2,
        amount: 50_000n,
        currency: "XOF",
      },
    });

    const guests = await Promise.all(
      [0, 1].map((index) =>
        tx.guest.create({
          data: {
            propertyId: property.id,
            guestCode: `GST-DBK-${index}`,
            firstName: "Client",
            lastName: `Concurrent ${index + 1}`,
          },
        }),
      ),
    );

    return {
      propertyId: property.id,
      roomTypeId: roomType.id,
      ratePlanId: ratePlan.id,
      guestIds: guests.map((guest) => guest.id),
    };
  });
}

/**
 * Tente une réservation dans une transaction `Serializable`, en relisant
 * l'inventaire DANS la transaction — exactement comme le service réel.
 */
async function attemptBooking(
  scenario: Scenario,
  organizationId: string,
  guestId: string,
  label: string,
  arrivalDate: Date,
  departureDate: Date,
): Promise<string> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.property_id', ${scenario.propertyId}, true)`;

        const availability = await computeAvailability(tx, {
          propertyId: scenario.propertyId,
          arrivalDate,
          departureDate,
          adults: 2,
        });

        const entry = availability.roomTypes[0];
        if (entry.availableRooms < 1) {
          throw new Error("ROOM_NOT_AVAILABLE");
        }

        const reservation = await tx.reservation.create({
          data: {
            propertyId: scenario.propertyId,
            reservationNumber: `DBK-${label}-${Date.now()}`,
            source: "DIRECT",
            status: "CONFIRMED",
            guestId,
            arrivalDate,
            departureDate,
            nights: 2,
            adults: 2,
            currency: "XOF",
            subtotal: 100_000n,
            totalAmount: 100_000n,
          },
          select: { id: true },
        });

        await tx.reservationRoom.create({
          data: {
            reservationId: reservation.id,
            propertyId: scenario.propertyId,
            roomTypeId: scenario.roomTypeId,
            ratePlanId: scenario.ratePlanId,
            adults: 2,
            children: 0,
            arrivalDate,
            departureDate,
            numberOfNights: 2,
            baseAmount: 100_000n,
            totalAmount: 100_000n,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("ROOM_NOT_AVAILABLE")) {
      return "controlled-error";
    }
    // Un conflit de sérialisation est un refus attendu, pas un bug : deux
    // transactions se disputent la même ligne, PostgreSQL en écarte une.
    if (message.includes("could not serialize") || message.includes("40001")) {
      return "controlled-error";
    }

    return `unexpected:${message}`;
  }
}

async function main(): Promise<void> {
  // --- Test unitaire du chevauchement --------------------------------------
  console.log("\n1. Chevauchement des périodes");
  const d = (day: string) => new Date(`${day}T00:00:00Z`);

  check(
    "deux périodes qui se recouvrent sont détectées",
    overlaps(d("2026-06-10"), d("2026-06-15"), d("2026-06-14"), d("2026-06-18")),
  );
  check(
    "un départ le jour de l'arrivée n'est pas un conflit",
    !overlaps(d("2026-06-10"), d("2026-06-15"), d("2026-06-15"), d("2026-06-18")),
  );
  check(
    "deux périodes disjointes ne sont pas un conflit",
    !overlaps(d("2026-06-01"), d("2026-06-05"), d("2026-06-10"), d("2026-06-15")),
  );

  // --- Préparation ---------------------------------------------------------
  console.log("\n2. Préparation : un établissement avec une seule chambre");

  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error("Exécutez d'abord `npm run db:seed`.");
  }

  const scenario = await prepareScenario(organization.id);
  const arrivalDate = new Date("2026-06-10T00:00:00Z");
  const departureDate = new Date("2026-06-12T00:00:00Z");

  // --- Disponibilité initiale ----------------------------------------------
  console.log("\n3. Disponibilité initiale");

  const initial = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    return computeAvailability(tx, {
      propertyId: scenario.propertyId,
      arrivalDate,
      departureDate,
      adults: 2,
    });
  });

  check(
    "une chambre vendable au départ",
    initial.totalAvailable === 1,
    `obtenu ${initial.totalAvailable}`,
  );

  // --- Deux réservations simultanées ----------------------------------------
  console.log("\n4. Deux réservations simultanées sur la dernière chambre");

  const results = await Promise.all([
    attemptBooking(scenario, organization.id, scenario.guestIds[0], "A", arrivalDate, departureDate),
    attemptBooking(scenario, organization.id, scenario.guestIds[1], "B", arrivalDate, departureDate),
  ]);

  const successes = results.filter((result) => result === "success").length;
  const controlledErrors = results.filter((result) => result === "controlled-error").length;

  console.log(`  résultats : ${results.join(" | ")}`);

  check("exactement une réservation aboutit", successes === 1);
  check("l'autre reçoit une erreur métier contrôlée", controlledErrors === 1);
  check(
    "aucune erreur inattendue",
    results.every((result) => result === "success" || result === "controlled-error"),
  );

  // --- État final en base --------------------------------------------------
  console.log("\n5. État final en base");

  const finalState = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;

    const reservations = await tx.reservation.count({
      where: { propertyId: scenario.propertyId, status: "CONFIRMED" },
    });
    const availability = await computeAvailability(tx, {
      propertyId: scenario.propertyId,
      arrivalDate,
      departureDate,
      adults: 2,
    });

    return { reservations, available: availability.totalAvailable };
  });

  check("une seule réservation enregistrée", finalState.reservations === 1, `obtenu ${finalState.reservations}`);
  check("plus aucune chambre disponible", finalState.available === 0, `obtenu ${finalState.available}`);

  console.log(`\n${passed} vérification(s) réussie(s), ${failed} en échec.`);

  // Nettoyage des données de test.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    await tx.property.deleteMany({ where: { id: scenario.propertyId } });
  });
}

main()
  .catch((error) => {
    console.error("\nÉCHEC :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
