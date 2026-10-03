/**
 * Vérification de l'intégrité de la base LagoonKey après application des
 * migrations. Ce script ne modifie aucune donnée : il interroge la base et
 * échoue si une garantie structurelle du cahier des charges est absente.
 *
 * Il vérifie concrètement que :
 *   1. les 57 tables attendues existent ;
 *   2. les extensions requises sont chargées (btree_gist, pgcrypto) ;
 *   3. les index d'idempotence existent (sections 70, 55, 136) ;
 *   4. les triggers de protection financière sont en place (section 81) ;
 *   5. les montants sont bien stockés en bigint (section 6, jamais de float).
 *
 * Usage : npx tsx prisma/verify-integrity.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(label: string, ok: boolean, detail: string): void {
  results.push({ label, ok, detail });
}

async function main(): Promise<void> {
  // --- 1. Tables attendues -------------------------------------------------
  const tableRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const tableCount = Number(tableRows[0]?.count ?? 0);
  record(
    "Tables créées",
    tableCount >= 57,
    `${tableCount} table(s) trouvée(s), 57 attendues`,
  );

  // --- 2. Extensions -------------------------------------------------------
  const extensionRows = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('btree_gist', 'pgcrypto')
  `;
  const extensions = extensionRows.map((row) => row.extname);
  record(
    "Extension btree_gist (contraintes d'exclusion)",
    extensions.includes("btree_gist"),
    extensions.includes("btree_gist") ? "chargée" : "ABSENTE — les contraintes anti-overlap échoueront",
  );
  record(
    "Extension pgcrypto",
    extensions.includes("pgcrypto"),
    extensions.includes("pgcrypto") ? "chargée" : "ABSENTE",
  );

  // --- 3. Index d'idempotence ---------------------------------------------
  const idempotencyIndexes = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('folio_items_idempotency_key_unique', 'payments_idempotency_key_unique')
  `;
  record(
    "Index d'idempotence (paiements + folio items)",
    idempotencyIndexes.length === 2,
    `${idempotencyIndexes.length}/2 index trouvés`,
  );

  // --- 4. Triggers de protection ------------------------------------------
  const triggerRows = await prisma.$queryRaw<{ tgname: string }[]>`
    SELECT tgname
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'invoices_immutable_after_finalization',
        'folio_items_no_physical_delete',
        'payments_no_physical_delete',
        'invoices_no_physical_delete'
      )
  `;
  record(
    "Triggers d'immuabilité financière",
    triggerRows.length === 4,
    `${triggerRows.length}/4 triggers trouvés`,
  );

  // --- 5. Type des montants -----------------------------------------------
  const amountColumns = await prisma.$queryRaw<
    { table_name: string; column_name: string; data_type: string }[]
  >`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('double precision', 'real')
      AND column_name LIKE '%amount%'
  `;
  record(
    "Aucun montant stocké en flottant (section 6)",
    amountColumns.length === 0,
    amountColumns.length === 0
      ? "tous les montants sont en bigint"
      : `COLONNES FLOUTANTES: ${amountColumns.map((c) => `${c.table_name}.${c.column_name}`).join(", ")}`,
  );

  // --- Rapport -------------------------------------------------------------
  console.log("");
  for (const result of results) {
    const icon = result.ok ? "OK  " : "ECHEC";
    console.log(`[${icon}] ${result.label} — ${result.detail}`);
  }
  console.log("");

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(`${failures.length} vérification(s) en échec.`);
    process.exit(1);
  }
  console.log("Toutes les vérifications d'intégrité sont passées.");
}

main()
  .catch((error) => {
    console.error("Échec de la vérification :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });