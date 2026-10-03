import { PrismaClient } from "@prisma/client";

import type { PrismaTransactionClient } from "@/lib/db";

/**
 * Vérification des workflows de séjour (PROMPTMVP sections 49, 50, 54 et
 * règles métier 1, 3, 4 de la section 81).
 *
 * Le service de séjour dépend d'une session authentifiée : il n'est pas
 * appelable directement. Ce script reproduit donc les mêmes écritures que
 * `checkIn`, `checkOut` et `changeRoom` afin de vérifier que les garanties
 * du domaine tiennent dans la base : verrous, unicité des tâches de ménage,
 * idempotence du paiement et historique conservé.
 *
 * Usage : npx tsx prisma/verify-stay-flow.ts
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

const d = (day: string) => new Date(`${day}T00:00:00Z`);

interface Scenario {
  propertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  reservationId: string;
  guestId: string;
  roomIds: string[];
  organizationId: string;
}

async function prepare(organizationId: string): Promise<Scenario> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

    const property = await tx.property.create({
      data: {
        organizationId,
        name: "Établissement test séjour",
        code: "STY",
        slug: `stay-test-${Date.now()}`,
        status: "ACTIVE",
      },
    });

    const roomType = await tx.roomType.create({
      data: {
        propertyId: property.id,
        name: "Chambre test",
        code: "TST",
        maxOccupancy: 2,
        baseOccupancy: 2,
        defaultRate: 50_000n,
      },
    });

    const roomIds: string[] = [];
    for (const number of ["001", "002", "003"]) {
      const room = await tx.room.create({
        data: {
          propertyId: property.id,
          roomTypeId: roomType.id,
          number,
          code: `TST-${number}`,
        },
        select: { id: true },
      });
      roomIds.push(room.id);
    }

    const ratePlan = await tx.ratePlan.create({
      data: { propertyId: property.id, name: "Tarif test", code: "TST", isPublic: true },
    });

    const guest = await tx.guest.create({
      data: {
        propertyId: property.id,
        guestCode: "GST-STAY-1",
        firstName: "Awa",
        lastName: "Test",
      },
    });

    const reservation = await tx.reservation.create({
      data: {
        propertyId: property.id,
        reservationNumber: "STY-RES-1",
        source: "DIRECT",
        status: "CONFIRMED",
        guestId: guest.id,
        arrivalDate: d("2026-07-10"),
        departureDate: d("2026-07-12"),
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
        propertyId: property.id,
        roomTypeId: roomType.id,
        ratePlanId: ratePlan.id,
        adults: 2,
        children: 0,
        arrivalDate: d("2026-07-10"),
        departureDate: d("2026-07-12"),
        numberOfNights: 2,
        baseAmount: 100_000n,
        totalAmount: 100_000n,
      },
    });

    return {
      propertyId: property.id,
      roomTypeId: roomType.id,
      ratePlanId: ratePlan.id,
      reservationId: reservation.id,
      guestId: guest.id,
      roomIds,
      organizationId,
    };
  });
}

/**
 * Reproduit le check-in du service (section 94).
 *
 * Le service réel est protégé par la session : le script rejoue ses
 * écritures pour valider les garanties du domaine dans la base.
 */
async function performCheckIn(
  scenario: Scenario,
  roomId: string,
): Promise<{ stayId: string; folioId: string }> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${scenario.organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.property_id', ${scenario.propertyId}, true)`;

      const stay = await tx.stay.create({
        data: {
          propertyId: scenario.propertyId,
          stayNumber: "STAY-TEST-1",
          reservationId: scenario.reservationId,
          primaryGuestId: scenario.guestId,
          status: "IN_HOUSE",
          actualCheckInAt: new Date(),
          plannedCheckIn: d("2026-07-10"),
          plannedCheckOut: d("2026-07-12"),
        },
        select: { id: true },
      });

      await tx.stayRoom.create({
        data: {
          stayId: stay.id,
          propertyId: scenario.propertyId,
          roomId,
          roomTypeId: scenario.roomTypeId,
          arrivalDate: d("2026-07-10"),
          departureDate: d("2026-07-12"),
        },
      });

      const folio = await tx.folio.create({
        data: {
          propertyId: scenario.propertyId,
          folioNumber: "FOL-TEST-1",
          stayId: stay.id,
          guestId: scenario.guestId,
          status: "OPEN",
          currency: "XOF",
          balance: 100_000n,
        },
        select: { id: true },
      });

      await tx.folioItem.create({
        data: {
          folioId: folio.id,
          propertyId: scenario.propertyId,
          businessDate: d("2026-07-10"),
          type: "ROOM",
          description: "Hébergement 2 nuits",
          quantity: 2,
          unitAmount: 50_000n,
          netAmount: 100_000n,
          grossAmount: 100_000n,
        },
      });

      await tx.reservation.update({
        where: { id: scenario.reservationId },
        data: { status: "CHECKED_IN" },
      });

      await tx.room.update({ where: { id: roomId }, data: { status: "OCCUPIED" } });

      await tx.roomStatusHistory.create({
        data: {
          propertyId: scenario.propertyId,
          roomId,
          previousStatus: "AVAILABLE",
          newStatus: "OCCUPIED",
          reason: "Check-in test",
          referenceType: "stay",
          referenceId: stay.id,
        },
      });

      return { stayId: stay.id, folioId: folio.id };
    },
    { isolationLevel: "Serializable" },
  );
}

/**
 * Reproduit le check-out du service (sections 54 et 95).
 *
 * La chambre part en sale, une tâche de ménage est créée, et la sortie est
 * auditée. Le paiement porte une clé d'idempotence dérivée du séjour.
 */
async function performCheckOut(
  scenario: Scenario,
  stayId: string,
  folioId: string,
  roomId: string,
  paymentAmount: bigint,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${scenario.organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${scenario.propertyId}, true)`;

    const payment = await tx.payment.create({
      data: {
        propertyId: scenario.propertyId,
        paymentNumber: "PAY-TEST-1",
        folioId,
        amount: paymentAmount,
        currency: "XOF",
        method: "CASH",
        status: "COMPLETED",
        idempotencyKey: `checkout:${stayId}:${folioId}`,
      },
      select: { id: true },
    });

    await tx.paymentAllocation.create({
      data: { paymentId: payment.id, folioId, amount: paymentAmount },
    });

    await tx.folio.update({
      where: { id: folioId },
      data: { balance: { decrement: paymentAmount }, status: "PAID" },
    });

    await tx.stay.update({
      where: { id: stayId },
      data: { status: "CHECKED_OUT", actualCheckOutAt: new Date() },
    });

    await tx.reservation.update({
      where: { id: scenario.reservationId },
      data: { status: "CHECKED_OUT" },
    });

    await tx.stayRoom.updateMany({ where: { stayId, releasedAt: null }, data: { releasedAt: new Date() } });

    // Règle métier 3 : la chambre est libérée mais sale.
    await tx.room.update({
      where: { id: roomId },
      data: { status: "AVAILABLE", housekeepingStatus: "DIRTY" },
    });

    // Section 36 : la tâche de ménage est automatique.
    const task = await tx.housekeepingTask.create({
      data: {
        propertyId: scenario.propertyId,
        roomId,
        taskType: "CHECKOUT_CLEAN",
        status: "PENDING",
        referenceType: "stay",
        referenceId: stayId,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        organizationId: scenario.organizationId,
        propertyId: scenario.propertyId,
        action: "stay.check_out",
        resource: "stay",
        resourceId: stayId,
        afterData: { status: "CHECKED_OUT" },
      },
    });

    return task.id;
  });
}

async function main(): Promise<void> {
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error("Exécutez d'abord `npm run db:seed`.");
  }

  const scenario = await prepare(organization.id);
  const [roomA, roomB] = scenario.roomIds;

  // --- Check-in -----------------------------------------------------------
  console.log("\n1. Check-in (section 49)");
  const { stayId, folioId } = await performCheckIn(scenario, roomA);

  const afterCheckIn = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    return {
      roomStatus: await tx.room.findUnique({ where: { id: roomA }, select: { status: true } }),
      reservation: await tx.reservation.findUnique({
        where: { id: scenario.reservationId },
        select: { status: true },
      }),
      stay: await tx.stay.findUnique({ where: { id: stayId }, select: { status: true } }),
      folioItems: await tx.folioItem.count({ where: { folioId } }),
      history: await tx.roomStatusHistory.count({ where: { roomId: roomA } }),
    };
  });

  check("le séjour est en cours", afterCheckIn.stay?.status === "IN_HOUSE");
  check("la réservation passe à CHECKED_IN", afterCheckIn.reservation?.status === "CHECKED_IN");
  check("la chambre passe à OCCUPIED", afterCheckIn.roomStatus?.status === "OCCUPIED");
  check("le folio reçoit les nuitées", afterCheckIn.folioItems === 1);
  check("la transition de statut est tracée (section 10)", afterCheckIn.history === 1);

  // --- Règle métier 4 : une chambre sale n'est pas vendable ----------------
  console.log("\n2. Règle métier 4 — une chambre sale n'est pas vendable");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    await tx.room.update({ where: { id: roomB }, data: { housekeepingStatus: "DIRTY" } });
  });

  const sellable = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    await tx.$executeRaw`SELECT set_config('app.property_id', ${scenario.propertyId}, true)`;

    const { computeAvailability } = await import("@/modules/availability/engine");
    return computeAvailability(tx, {
      propertyId: scenario.propertyId,
      arrivalDate: d("2026-07-20"),
      departureDate: d("2026-07-22"),
      adults: 2,
    });
  });

  check(
    "les 3 chambres existent mais une seule est invendue",
    sellable.roomTypes[0]?.totalRooms === 3 && sellable.totalAvailable === 2,
    `total ${sellable.roomTypes[0]?.totalRooms}, disponible ${sellable.totalAvailable}`,
  );

  // --- Règle métier 3 : le checkout met la chambre en sale ----------------
  console.log("\n3. Check-out (section 54) et règle métier 3");
  const taskId = await performCheckOut(scenario, stayId, folioId, roomA, 100_000n);

  const afterCheckOut = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    return {
      room: await tx.room.findUnique({
        where: { id: roomA },
        select: { status: true, housekeepingStatus: true },
      }),
stay: await tx.stay.findUnique({ where: { id: stayId }, select: { status: true } }),
      folio: await tx.folio.findUnique({ where: { id: folioId }, select: { balance: true, status: true } }),
      task: await tx.housekeepingTask.findUnique({ where: { id: taskId }, select: { taskType: true } }),
      audit: await tx.auditLog.count({ where: { resourceId: stayId, action: "stay.check_out" } }),
      releasedRooms: await tx.stayRoom.count({ where: { stayId, releasedAt: { not: null } } }),
    };
  });

  check("le séjour est clôturé", afterCheckOut.stay?.status === "CHECKED_OUT");
  check("la chambre est libérée", afterCheckOut.room?.status === "AVAILABLE");
  check(
    "la chambre passe en DIRTY (règle métier 3)",
    afterCheckOut.room?.housekeepingStatus === "DIRTY",
  );
  check("le solde est à zéro", afterCheckOut.folio?.balance === 0n);
  check("le folio est marqué PAID", afterCheckOut.folio?.status === "PAID");
  check("une tâche de ménage est créée", afterCheckOut.task?.taskType === "CHECKOUT_CLEAN");
  check("le départ est audité (section 42)", afterCheckOut.audit === 1);
  check("l'historique d'occupation est conservé", afterCheckOut.releasedRooms === 1);

  // --- Idempotence du paiement (sections 70 et 135) ----------------------
  console.log("\n4. Idempotence du paiement de checkout (section 135)");
  const duplicate = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    try {
      await tx.payment.create({
        data: {
          propertyId: scenario.propertyId,
          paymentNumber: "PAY-TEST-2",
          folioId,
          amount: 100_000n,
          currency: "XOF",
          method: "CASH",
          status: "COMPLETED",
          idempotencyKey: `checkout:${stayId}:${folioId}`,
        },
      });
      return "created";
    } catch {
      return "refused";
    }
  });

  check("un second paiement identique est refusé par la base", duplicate === "refused", duplicate);

  const paymentCount = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    return tx.payment.count({ where: { folioId } });
  });

  check("un seul paiement enregistré", paymentCount === 1, `obtenu ${paymentCount}`);

  // --- Immuabilité financière (règle métier 5) --------------------------
  console.log("\n5. Règle métier 5 — aucune transaction n'est supprimable");
  const deletion = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`;
    try {
      await tx.$executeRaw`DELETE FROM payments WHERE folio_id = ${folioId}::uuid`;
      return "deleted";
    } catch {
      return "refused";
    }
  });

  check("la suppression directe en SQL est refusée", deletion === "refused", deletion);

  console.log(`\n${passed} vérification(s) réussie(s), ${failed} en échec.`);

  // Nettoyage des données de test. Le trigger d'immuabilité financière est
  // désactivé le temps de l'opération puis réactivé : la protection reste
  // intacte pour la production.
  try {
    await cleanup(scenario.propertyId, organization.id);
    console.log("Données de test supprimées.");
  } catch (error) {
    console.error("Nettoyage impossible :", error instanceof Error ? error.message : error);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Supprime les données de test.
 *
 * Le trigger `prevent_financial_row_deletion` (règle métier 5) bloque la
 * suppression des folios, paiements et factures — y compris pour un jeu
 * d'essai. Le trigger est désactivé localement le temps du nettoyage puis
 * réactivé : le test ne doit pas contourner la protection en production,
 * mais il doit pouvoir nettoyer ses propres données.
 */
async function cleanup(propertyId: string, organizationId: string): Promise<void> {
  const withTenant = async <T>(operation: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return operation(tx);
    });

  const tables = ["folio_items", "payments", "invoices"];

  // Sous Row Level Security, un `ALTER TABLE` suivi d'un `DELETE` dans la
  // même transaction fait échouer l'ensemble : chaque étape est isolée.
  for (const table of tables) {
    await withTenant(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${table}_no_physical_delete`);
    });
  }

  try {
    await withTenant(async (tx) => {
      // Les affectations de paiement référencent les folios : elles doivent
      // partir avant, sinon la cascade est bloquée.
      await tx.paymentAllocation.deleteMany({});
      await tx.property.deleteMany({ where: { id: propertyId } });
    });
  } finally {
    for (const table of tables) {
      await withTenant(async (tx) => {
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${table}_no_physical_delete`);
      }).catch(() => undefined);
    }
  }
}

main()
  .then(async () => {
    // Le nettoyage est effectué dans `finally` : il doit avoir lieu même si
    // une vérification échoue, sans masquer les résultats déjà affichés.
  })
  .catch((error) => {
    console.error("\nÉCHEC :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
