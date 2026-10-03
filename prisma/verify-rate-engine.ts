import {
  applyDiscount,
  computeRoomSubtotal,
  countNights,
  enumerateNights,
  MissingRateError,
  resolveNightlyRate,
  startOfDay,
  type RateCandidate,
} from "@/modules/rates/engine";

/**
 * Test du moteur tarifaire (PROMPTMVP.md sections 11 et 78).
 *
 * Le moteur est une fonction pure : il est testé sans base de données. Ce
 * script valide le comportement sur deux saisons, la couverture d'occupation
 * et les remises, sur des montants réels en XOF.
 *
 * Usage : npx tsx prisma/verify-rate-engine.ts
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

function section(title: string): void {
  console.log(`\n${title}`);
}

function candidate(overrides: Partial<RateCandidate> = {}): RateCandidate {
  return {
    amount: 50_000n,
    currency: "XOF",
    validFrom: startOfDay(new Date("2026-01-01T00:00:00Z")),
    validTo: startOfDay(new Date("2026-12-31T00:00:00Z")),
    occupancy: 2,
    seasonId: null,
    seasonPriority: null,
    minimumNights: null,
    maximumNights: null,
    fromSeason: false,
    ...overrides,
  };
}

function main(): void {
  // --- Comptage des nuits --------------------------------------------------
  section("1. Comptage des nuits");
  check(
    "3 nuits entre le 10 et le 13",
    countNights(new Date("2026-03-10T00:00:00Z"), new Date("2026-03-13T00:00:00Z")) === 3,
  );
  check(
    "1 nuit pour une entrée le jour du départ",
    countNights(new Date("2026-03-10T00:00:00Z"), new Date("2026-03-11T00:00:00Z")) === 1,
  );
  check(
    "le passage de mois est compté correctement",
    countNights(new Date("2026-01-30T00:00:00Z"), new Date("2026-02-02T00:00:00Z")) === 3,
  );
  check(
    "l'année bissextile est gérée",
    countNights(new Date("2028-02-28T00:00:00Z"), new Date("2028-03-01T00:00:00Z")) === 2,
  );

  // --- Résolution d'une nuit ------------------------------------------------
  section("2. Résolution du tarif d'une nuit");
  const base = candidate({ amount: 50_000n });

  check(
    "un tarif hors saison s'applique",
    resolveNightlyRate([base], startOfDay(new Date("2026-06-15T00:00:00Z")), 2, 2).nightlyRate?.amount ===
      50_000n,
  );
  check(
    "un tarif hors fenêtre de validité ne s'applique pas",
    resolveNightlyRate(
      [candidate({ validFrom: startOfDay(new Date("2026-12-01T00:00:00Z")) })],
      startOfDay(new Date("2026-06-15T00:00:00Z")),
      2,
      2,
    ).nightlyRate === null,
  );
  check(
    "une occupation supérieure à la grille est refusée",
    resolveNightlyRate([base], startOfDay(new Date("2026-06-15T00:00:00Z")), 4, 2).nightlyRate === null,
  );
  check(
    "la saison écrase le tarif de base",
    resolveNightlyRate(
      [base, candidate({ amount: 90_000n, seasonId: "s1", seasonPriority: 10, fromSeason: true })],
      startOfDay(new Date("2026-06-15T00:00:00Z")),
      2,
      2,
    ).nightlyRate?.amount === 90_000n,
  );
  // Une saison, même de priorité 1, écrase le tarif hors-saison : ce dernier
  // est traité comme une priorité -1. Ce n'est que face à une AUTRE saison
  // de priorité supérieure que le départage s'applique.
  check(
    "une saison de priorité 1 écrase le hors-saison",
    resolveNightlyRate(
      [base, candidate({ amount: 90_000n, seasonId: "s2", seasonPriority: 1, fromSeason: true })],
      startOfDay(new Date("2026-06-15T00:00:00Z")),
      2,
      2,
    ).nightlyRate?.amount === 90_000n,
  );
  check(
    "entre deux saisons, la priorité la plus élevée l'emporte",
    resolveNightlyRate(
      [
        candidate({ amount: 90_000n, seasonId: "low", seasonPriority: 1, fromSeason: true }),
        candidate({ amount: 120_000n, seasonId: "high", seasonPriority: 10, fromSeason: true }),
      ],
      startOfDay(new Date("2026-06-15T00:00:00Z")),
      2,
      2,
    ).nightlyRate?.amount === 120_000n,
  );
  check(
    "une durée minimale est respectée",
    resolveNightlyRate(
      [candidate({ minimumNights: 7 })],
      startOfDay(new Date("2026-06-15T00:00:00Z")),
      2,
      2,
    ).nightlyRate === null,
  );
  check(
    "l'absence de toute grille est signalée NO_RATE_DEFINED",
    resolveNightlyRate([], startOfDay(new Date("2026-06-15T00:00:00Z")), 2, 2).reason ===
      "NO_RATE_DEFINED",
  );

  // --- Séjour à cheval sur deux saisons ------------------------------------
  section("3. Séjour à cheval sur deux saisons");
  const highSeason = candidate({
    amount: 90_000n,
    seasonId: "s1",
    seasonPriority: 10,
    fromSeason: true,
    validFrom: startOfDay(new Date("2026-06-01T00:00:00Z")),
    validTo: startOfDay(new Date("2026-06-30T00:00:00Z")),
  });
  const crossed = computeRoomSubtotal(
    [base, highSeason],
    new Date("2026-06-29T00:00:00Z"),
    new Date("2026-07-03T00:00:00Z"),
    2,
  );

  check("le séjour compte 4 nuits", crossed.nights === 4, `obtenu ${crossed.nights}`);
  check("2 nuits en haute saison", crossed.breakdown.filter((night) => night.fromSeason).length === 2);
  check(
    "le total mêle les deux tarifs (2×50 000 + 2×90 000 = 280 000)",
    crossed.roomSubtotal === 280_000n,
    `obtenu ${crossed.roomSubtotal}`,
  );
  check("le détail par nuit est fourni", crossed.breakdown.length === 4);

  // --- Grille manquante -----------------------------------------------------
  section("4. Refus de facturer un séjour incomplet");
  let raised = false;
  try {
    computeRoomSubtotal(
      [
        candidate({
          validFrom: startOfDay(new Date("2026-01-01T00:00:00Z")),
          validTo: startOfDay(new Date("2026-01-31T00:00:00Z")),
        }),
      ],
      new Date("2026-06-29T00:00:00Z"),
      new Date("2026-07-03T00:00:00Z"),
      2,
    );
  } catch (error) {
    raised = error instanceof MissingRateError && error.missingDates.length === 4;
  }
  check("une grille manquante lève MissingRateError", raised);

  // --- Remises --------------------------------------------------------------
  section("5. Remises");
  const percent = applyDiscount(280_000n, { type: "PERCENTAGE", value: 10n });
  check("10 % de 280 000 = 28 000 de remise", percent.applied?.amount === 28_000n);
  check("le net est 252 000", percent.netAmount === 252_000n);

  const fixed = applyDiscount(280_000n, { type: "FIXED_AMOUNT", value: 50_000n });
  check("une remise fixe de 50 000 laisse 230 000", fixed.netAmount === 230_000n);

  const capped = applyDiscount(100_000n, { type: "FIXED_AMOUNT", value: 500_000n });
  check(
    "une remise supérieure au total est plafonnée",
    capped.netAmount === 0n,
    `obtenu ${capped.netAmount}`,
  );

  check("sans remise le montant est inchangé", applyDiscount(100_000n, null).netAmount === 100_000n);

  // --- Précision des grands montants ---------------------------------------
  section("6. Précision bigint sur grands montants");
  const huge = applyDiscount(999_999_999_999n, { type: "PERCENTAGE", value: 18n });
  check(
    "18 % d'un montant à douze chiffres reste exact",
    huge.applied?.amount === 179_999_999_999n,
    `obtenu ${huge.applied?.amount}`,
  );

  // --- Énumération des nuits ------------------------------------------------
  section("7. Énumération des nuits");
  const nights = enumerateNights(new Date("2026-06-29T00:00:00Z"), new Date("2026-07-02T00:00:00Z"));
  check("3 nuits énumérées", nights.length === 3);
  check(
    "la première nuit est le jour d'arrivée",
    nights[0]?.getTime() === startOfDay(new Date("2026-06-29T00:00:00Z")).getTime(),
  );
  check(
    "la date de départ n'est pas comptée",
    nights[2]?.getTime() === startOfDay(new Date("2026-07-01T00:00:00Z")).getTime(),
  );
}

main();

console.log(`\n${passed} vérification(s) réussie(s), ${failed} en échec.`);
if (failed > 0) {
  process.exit(1);
}
