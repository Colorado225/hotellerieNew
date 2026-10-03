import { applyTaxRules, computeNightTax } from "@/modules/tax/engine";

/**
 * Vérification du moteur de taxation (PROMPTMVP sections 30, 31 et 126).
 *
 * Le cas critique est la taxe incluse : un prix affiché TTC de 118 000 à
 * 18 % représente un net de 100 000. Confondre les deux produirait une
 * facture fausse d'une valeur qui ne se voit qu'au contrôle.
 *
 * Usage : npx tsx prisma/verify-tax-engine.ts
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

const exclusive18 = { code: "TVA-18", ratePercent: 18, fixedAmount: null, isInclusive: false };
const inclusive18 = { code: "TVA-18", ratePercent: 18, fixedAmount: null, isInclusive: true };
const fixedTax = { code: "FIXE", ratePercent: null, fixedAmount: 5_000n, isInclusive: false };

function main(): void {
  // --- Taxe exclusive ------------------------------------------------------
  console.log("\n1. Taxe exclusive (ajoutée au prix)");
  const exclusive = applyTaxRules(100_000n, [exclusive18]);

  check("le net reste le montant de base", exclusive.netAmount === 100_000n);
  check("18 % de 100 000 = 18 000", exclusive.taxAmount === 18_000n);
  check("le brut vaut 118 000", exclusive.grossAmount === 118_000n);
  check("le détail contient la règle appliquée", exclusive.breakdown.length === 1);
  check("le code fiscal est conservé", exclusive.breakdown[0]?.code === "TVA-18");

  // --- Taxe incluse --------------------------------------------------------
  console.log("\n2. Taxe incluse (déduite du prix affiché)");
  const inclusive = applyTaxRules(118_000n, [inclusive18]);

  check("le net d'un prix TTC de 118 000 est 100 000", inclusive.netAmount === 100_000n);
  check("la taxe extraite vaut 18 000", inclusive.taxAmount === 18_000n);
  check("le brut reste le montant affiché", inclusive.grossAmount === 118_000n);

  const simple = applyTaxRules(100_000n, [inclusive18]);
  check("un prix de 100 000 TTC à 18 % donne un net de 84 745", simple.netAmount === 84_745n);

  // --- Taxe forfaitaire ----------------------------------------------------
  console.log("\n3. Taxe forfaitaire");
  const flat = applyTaxRules(100_000n, [fixedTax]);
  check("un montant fixe s'applique en totalité", flat.taxAmount === 5_000n);
  check("le brut vaut 105 000", flat.grossAmount === 105_000n);

  // --- Taxes cumulées ------------------------------------------------------
  console.log("\n4. Taxes cumulées");
  const combined = applyTaxRules(100_000n, [exclusive18, fixedTax]);
  check("deux taxes s'additionnent", combined.taxAmount === 23_000n);
  check("le brut cumulé vaut 123 000", combined.grossAmount === 123_000n);
  check("le détail conserve les deux règles", combined.breakdown.length === 2);

  // --- Cas limites ---------------------------------------------------------
  console.log("\n5. Cas limites");
  check("aucune règle ne produit une taxe nulle", applyTaxRules(100_000n, []).taxAmount === 0n);

  const zero = applyTaxRules(0n, [exclusive18]);
  check("un montant nul reste nul", zero.grossAmount === 0n);

  const incomplete = applyTaxRules(100_000n, [
    { code: "INCOMPLETE", ratePercent: null, fixedAmount: null, isInclusive: false },
  ]);
  check(
    "une règle incomplète est ignorée plutôt que de fausser la facture",
    incomplete.taxAmount === 0n && incomplete.grossAmount === 100_000n,
  );

  // --- Taxe de nuitée (section 31) ----------------------------------------
  console.log("\n6. Taxe communale de nuitée (section 31)");
  check("500 FCFA × 3 nuits = 1 500", computeNightTax(500n, 3) === 1_500n);
  check("2 000 FCFA × 1 nuit = 2 000", computeNightTax(2_000n, 1) === 2_000n);
  check("un séjour d'une nuit vaut une unité", computeNightTax(2_000n, 0) === 0n);

  // --- Précision -----------------------------------------------------------
  console.log("\n7. Précision bigint");
  const large = applyTaxRules(999_999_999_999n, [exclusive18]);
  check(
    "18 % d'un montant à douze chiffres reste exact",
    large.taxAmount === 179_999_999_999n,
    `obtenu ${large.taxAmount}`,
  );

  console.log(`\n${passed} vérification(s) réussie(s), ${failed} en échec.`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();