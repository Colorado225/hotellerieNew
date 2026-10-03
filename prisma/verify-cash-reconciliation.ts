import { reconcile } from "@/modules/cash/reconciliation";

/**
 * Vérification de la réconciliation de caisse (PROMPTMVP section 56).
 *
 * Le calcul est une fonction pure : il se teste sans base. Les cas couverts
 * sont ceux d'un caissier en fin de journée — l'écart entre l'attendu et le
 * compté doit être exact, sinon le rapprochement est faux.
 *
 * Usage : npx tsx prisma/verify-cash-reconciliation.ts
 */

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

function main(): void {
  // --- Cas de référence du §56 -------------------------------------------
  console.log("\n1. Cas documenté dans la section 56");
  const reference = reconcile(
    0n,
    [
      { type: "PAYMENT", amount: 900_000n },
      { type: "REFUND", amount: 50_000n },
    ],
    845_000n,
  );

  check("l'attendu s'élève à 850 000", reference.expectedBalance === 850_000n, `obtenu ${reference.expectedBalance}`);
  check("la variance est de -5 000", reference.variance === -5_000n, `obtenu ${reference.variance}`);

  // --- Session sans mouvement ---------------------------------------------
  console.log("\n2. Session calme");
  const idle = reconcile(100_000n, [], 100_000n);
  check("le solde d'ouverture est conservé", idle.expectedBalance === 100_000n);
  check("aucune variance", idle.variance === 0n);

  const over = reconcile(100_000n, [], 105_000n);
  check("un excédent compté apparaît en variance positive", over.variance === 5_000n);

  const missing = reconcile(100_000n, [], 95_000n);
  check("un manque apparaît en variance négative", missing.variance === -5_000n);

  // --- Séparation des flux -------------------------------------------------
  console.log("\n3. Séparation des flux d'espèces");
  const mixed = reconcile(
    0n,
    [
      { type: "PAYMENT", amount: 100_000n },
      // Une carte bancaire n'entre pas dans la caisse physique : l'inclure
      // fausserait le rapprochement.
      { type: "SALE", amount: 250_000n },
      { type: "CASH_OUT", amount: 30_000n },
    ],
    320_000n,
  );

  check(
    "les mouvements sont tous pris en compte",
    mixed.expectedBalance === 320_000n,
    `obtenu ${mixed.expectedBalance}`,
  );
  check("la caisse est équilibrée", mixed.variance === 0n);

  // --- Types de mouvements sans effet sur le solde -------------------------
  console.log("\n4. Mouvements sans effet sur les espèces");
  const withAdjustment = reconcile(
    0n,
    [
      { type: "PAYMENT", amount: 100_000n },
      // Un ajustement corrige un relevé, il ne décrit pas un mouvement de
      // fonds : il ne doit pas enter dans le solde.
      { type: "ADJUSTMENT", amount: 999_999n },
    ],
    100_000n,
  );

  check(
    "un ajustement ne modifie pas le solde attendu",
    withAdjustment.expectedBalance === 100_000n,
    `obtenu ${withAdjustment.expectedBalance}`,
  );
  check("la caisse reste équilibrée", withAdjustment.variance === 0n);

  // --- Précision -----------------------------------------------------------
  console.log("\n5. Précision sur montants élevés");
  const large = reconcile(
    1_000_000_000n,
    [{ type: "PAYMENT", amount: 999_999_999_999n }],
    1_000_999_999_999n,
  );
  check(
    "l'arithmétique bigint reste exacte",
    large.variance === 0n,
    `obtenu ${large.variance}`,
  );

  console.log(`\n${passed} vérification(s) réussie(s), ${failed} en échec.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();