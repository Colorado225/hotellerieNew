import { PrismaClient } from "@prisma/client";

import { computeChargeAmounts, OverpaymentNotAllowedError, splitPayment } from "@/modules/folios/money";

/**
 * Vérification du noyau financier (PROMPTMVP sections 51, 53, 116 et 135,
 * règle métier 5 et 6).
 *
 * Les fonctions pures sont testées sans base ; les garanties de la base sont
 * ensuite vérifiées sur un jeu de données réel.
 *
 * Usage : npx tsx prisma/verify-finance-core.ts
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

const ORG = "59314561-e871-4760-a135-ad3dcebc8a06";

/**
 * Supprime le jeu de données de test.
 *
 * Le trigger d'immuabilité financière est désactivé le temps de l'opération
 * puis réactivé en mode `ALWAYS` : c'est le seul mode qui résiste à une
 * simple réactivation standard, et le seul acceptable pour une garantie
 * d'intégrité comptable.
 */
async function cleanupFinanceFixture(propertyId: string, organizationId: string): Promise<void> {
  const tables = ["folio_items", "payments", "invoices"];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table} DISABLE TRIGGER ${table}_no_physical_delete`,
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

      // Ordre conforme aux dépendances : les enfants d'abord.
      await tx.folioItem.deleteMany({ where: { folio: { folioNumber: { startsWith: "FIN-FOL-" } } } });
      await tx.folio.deleteMany({ where: { folioNumber: { startsWith: "FIN-FOL-" } } });
      await tx.stay.deleteMany({ where: { stayNumber: { startsWith: "FIN-STAY-" } } });
      await tx.reservation.deleteMany({
        where: { reservationNumber: { startsWith: "FIN-RES-" } },
      });
      await tx.guest.deleteMany({ where: { guestCode: { startsWith: "FIN-" } } });
    });
  } finally {
    for (const table of tables) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${table} ENABLE ALWAYS TRIGGER ${table}_no_physical_delete`,
      );
    }
  }
}

async function main(): Promise<void> {
  // --- Calcul des montants (section 51) ----------------------------------
  console.log("\n1. Calcul d'une charge (section 51)");
  const noTax = computeChargeAmounts(1, 50_000n, null);
  check("une charge simple vaut son prix", noTax.grossAmount === 50_000n);
  check("sans taxe, la taxe est nulle", noTax.taxAmount === 0n);

  const quantity = computeChargeAmounts(3, 10_000n, null);
  check("3 × 10 000 = 30 000", quantity.netAmount === 30_000n);

  const fractional = computeChargeAmounts(2.5, 10_000n, null);
  check("2,5 × 10 000 = 25 000", fractional.netAmount === 25_000n);

  const taxed = computeChargeAmounts(1, 100_000n, 18);
  check("18 % de 100 000 = 18 000", taxed.taxAmount === 18_000n);
  check("le brut vaut net + taxe", taxed.grossAmount === 118_000n);
  check(
    "la contrainte net + tax = gross est respectée",
    taxed.grossAmount === taxed.netAmount + taxed.taxAmount,
  );

  const precision = computeChargeAmounts(1, 999_999_999_999n, 18);
  check(
    "précision intacte sur 12 chiffres avec taxe",
    precision.taxAmount === 179_999_999_999n,
    `obtenu ${precision.taxAmount}`,
  );

  // --- Répartition du paiement (section 116) -----------------------------
  console.log("\n2. Surpaiement et avoir (section 116)");

  const exact = splitPayment(100_000n, 100_000n, 0n, false);
  check("un paiement exact solde entièrement", exact.appliedAmount === 100_000n && exact.creditAmount === 0n);

  const partial = splitPayment(40_000n, 100_000n, 0n, false);
  check("un paiement partiel n'impute que le montant versé", partial.appliedAmount === 40_000n);

  let overpayRefused = false;
  try {
    splitPayment(120_000n, 100_000n, 0n, false);
  } catch (error) {
    overpayRefused = error instanceof OverpaymentNotAllowedError;
  }
  check("un trop-perçu est refusé par défaut (règle 6)", overpayRefused);

  // Section 116 : 120 000 sur une facture de 100 000.
  const overpay = splitPayment(120_000n, 100_000n, 0n, true);
  check("un trop-perçu autorisé impute 100 000", overpay.appliedAmount === 100_000n);
  check("l'excédent de 20 000 devient un avoir", overpay.creditAmount === 20_000n);

  // Un avoir de 30 000 et un paiement de 50 000 : le paiement solde l'avoir
  // (30 000) puis excède de 20 000. C'est un trop-perçu, donc la règle 6
  // s'applique : il faut l'autoriser explicitement.
  let creditOverpayRefused = false;
  try {
    splitPayment(50_000n, 0n, 30_000n, false);
  } catch (error) {
    creditOverpayRefused = error instanceof OverpaymentNotAllowedError;
  }
  check("un trop-perçu sur avoir existant est refusé par défaut", creditOverpayRefused);

  const withCredit = splitPayment(50_000n, 0n, 30_000n, true);
  check(
    "autorisé, il solde l'avoir de 30 000",
    withCredit.appliedAmount === 30_000n,
    `obtenu ${withCredit.appliedAmount}`,
  );
  check(
    "et conserve 20 000 en nouvel avoir",
    withCredit.creditAmount === 20_000n,
    `obtenu ${withCredit.creditAmount}`,
  );

  // --- Immuabilité en base (règle métier 5) ------------------------------
  console.log("\n3. Règle métier 5 — aucune écriture n'est supprimable");

  // Un trigger ne peut se déclencher que sur une ligne existante : le
  // test crée donc un folio complet avant d tenter une suppression.
  const fixture = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ORG}, true)`;

    const property = await tx.property.findFirstOrThrow({
      where: { code: "HID" },
      select: { id: true, businessDate: true },
    });

    const guest = await tx.guest.create({
      data: {
        propertyId: property.id,
        guestCode: `FIN-${Date.now()}`,
        firstName: "Test",
        lastName: "Finance",
      },
      select: { id: true },
    });

    const reservation = await tx.reservation.create({
      data: {
        propertyId: property.id,
        reservationNumber: `FIN-RES-${Date.now()}`,
        source: "DIRECT",
        status: "CHECKED_IN",
        guestId: guest.id,
        arrivalDate: property.businessDate,
        departureDate: new Date(property.businessDate.getTime() + 86_400_000),
        nights: 1,
        adults: 1,
        currency: "XOF",
        subtotal: 50_000n,
        totalAmount: 50_000n,
      },
      select: { id: true },
    });

    const stay = await tx.stay.create({
      data: {
        propertyId: property.id,
        stayNumber: `FIN-STAY-${Date.now()}`,
        reservationId: reservation.id,
        primaryGuestId: guest.id,
        status: "IN_HOUSE",
        actualCheckInAt: new Date(),
        plannedCheckIn: property.businessDate,
        plannedCheckOut: new Date(property.businessDate.getTime() + 86_400_000),
      },
      select: { id: true },
    });

    const folio = await tx.folio.create({
      data: {
        propertyId: property.id,
        folioNumber: `FIN-FOL-${Date.now()}`,
        stayId: stay.id,
        guestId: guest.id,
        status: "OPEN",
        currency: "XOF",
      },
      select: { id: true },
    });

    const item = await tx.folioItem.create({
      data: {
        folioId: folio.id,
        propertyId: property.id,
        businessDate: property.businessDate,
        type: "OTHER_SERVICE",
        description: "Ligne de test",
        quantity: 1,
        unitAmount: 50_000n,
        netAmount: 50_000n,
        grossAmount: 50_000n,
      },
      select: { id: true },
    });

    return { propertyId: property.id, folioId: folio.id, itemId: item.id };
  });

  const suppression = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ORG}, true)`;
    try {
      await tx.$executeRaw`DELETE FROM folio_items WHERE id = ${fixture.itemId}::uuid`;
      return "supprimé";
    } catch {
      return "refusé";
    }
  });

  check("la suppression d'une ligne de folio est refusée", suppression === "refusé", suppression);

  const stillThere = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ORG}, true)`;
    return (await tx.folioItem.findUnique({ where: { id: fixture.itemId } })) !== null;
  });

  check("la ligne est toujours présente après la tentative", stillThere);

  // Nettoyage : le trigger interdit la suppression, il est désactivé le
  // temps de l'opération puis réactivé.
  await cleanupFinanceFixture(fixture.propertyId, ORG);

  // --- Idempotence du paiement (section 135) ----------------------------
  console.log("\n4. Clé d'idempotence des paiements (section 135)");
  const index = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payments_idempotency_key_unique'
  `;
  check(
    "l'index unique partiel existe en base",
    index.length === 1,
    "l'index garantit qu'une clé ne peut être consommée qu'une fois",
  );

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
  .finally(async () => {
    await prisma.$disconnect();
  });