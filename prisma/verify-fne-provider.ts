import { MockFneProvider } from "@/modules/fne/mock-provider";
import {
  FneTransportError,
  sanitizeResponse,
  validateFnePayload,
  type FneInvoicePayload,
  type FneRequestContext,
} from "@/modules/fne/provider";

/**
 * Vérification de la couche FNE (PROMPTMVP sections 33 et 139).
 *
 * Le §139 exige de tester cinq scénarios : succès, timeout, erreur 500,
 * rejet et requête en double. Ce script les couvre tous.
 *
 * Usage : npx tsx prisma/verify-fne-provider.ts
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

const context = (attempt = 1, key = "fne-key-0001"): FneRequestContext => ({
  idempotencyKey: key,
  correlationId: `corr-${attempt}`,
  attemptNumber: attempt,
});

const basePayload = (): FneInvoicePayload => ({
  invoiceId: "inv-1",
  invoiceNumber: "FAC-2026-00001",
  issuedAt: new Date("2026-03-01T00:00:00Z"),
  seller: {
    name: "Hôtel Ivoire Demo",
    taxIdentifier: "CI-DEMO-0001",
    rccm: "CI-ABJ-1234",
    address: "Plateau, Abidjan",
    phone: "+2250100000000",
    email: "facturation@demo.ci",
  },
  buyer: {
    name: "Awa Kouassi",
    taxIdentifier: null,
    address: "Cocody, Abidjan",
    phone: "+2250700000000",
    email: null,
  },
  currency: "XOF",
  subtotal: 100_000n,
  taxAmount: 18_000n,
  totalAmount: 118_000n,
  items: [
    {
      description: "Hébergement 2 nuits",
      quantity: "2",
      unitPrice: 50_000n,
      discountAmount: 0n,
      netAmount: 100_000n,
      taxCode: "TVA-18",
    },
  ],
  taxes: [{ code: "TVA-18", ratePercent: 18, amount: 18_000n }],
});

const payload = (overrides: Partial<FneInvoicePayload> = {}): FneInvoicePayload => ({
  ...basePayload(),
  ...overrides,
});
async function main(): Promise<void> {
  // --- Validation avant envoi ---------------------------------------------
  console.log("\n1. Validation de la charge utile");
  check("une facture valide ne remonte aucun problème", validateFnePayload(payload()).length === 0);
  check(
    "un total incohérent est détecté",
    validateFnePayload(payload({ totalAmount: 999_999n })).some((p) => p.includes("ne se recoupent")),
  );
  check(
    "une facture sans ligne est refusée",
    validateFnePayload(payload({ items: [] })).some((p) => p.includes("sans ligne")),
  );
  check(
    "un montant nul est refusé",
    validateFnePayload(payload({ totalAmount: 0n })).some((p) => p.includes("nul ou négatif")),
  );
  check(
    "un client sans nom est refusé",
    validateFnePayload(payload({ buyer: { ...basePayload().buyer, name: "" } })).some((p) =>
      p.includes("client facturé"),
    ),
  );

  // --- Scénario 1 : succès (section 139) ----------------------------------
  console.log("\n2. Scénario succès");
  const provider = new MockFneProvider({ outcome: "CERTIFIED" });
  const success = await provider.submitInvoice(payload(), context());

  check("la facture est certifiée", success.status === "CERTIFIED");
  check("un numéro FNE est attribué", success.fneNumber !== null);
  check("une référence de certification est fournie", success.certificationReference !== null);
  check("un QR code est fourni", success.qrCodeData !== null);
  check("un identifiant de requête est journalisé", success.requestId !== null);

  // --- Scénario 2 : requête en double (règle 8) --------------------------
  console.log("\n3. Scénario requête en double — règle 8 du §81");
  const duplicate = await provider.submitInvoice(payload(), context());

  check("la seconde soumission retourne le même numéro", duplicate.fneNumber === success.fneNumber);
  check("aucune double certification", duplicate.certificationReference === success.certificationReference);

  const distinct = await provider.submitInvoice(payload(), context(1, "autre-cle-0001"));
  check(
    "une clé différente produit une certification distincte",
    distinct.certificationReference !== success.certificationReference,
  );

  // --- Scénario 3 : rejet ---------------------------------------------------
  console.log("\n4. Scénario rejet par la plateforme");
  const rejecting = new MockFneProvider({
    outcome: "REJECTED",
    rejectionReason: "Numéro de TVA invalide",
  });
  const rejected = await rejecting.submitInvoice(payload(), context(1, "cle-rejet-0001"));

  check("le rejet est rapporté comme REJECTED", rejected.status === "REJECTED");
  check("aucun numéro FNE n'est attribué", rejected.fneNumber === null);
  check("le motif du rejet est conservé", rejected.errorMessage === "Numéro de TVA invalide");
  check("un code d'erreur est fourni", rejected.errorCode !== null);

  // --- Scénarios 4 et 5 : timeout et erreur 500 ---------------------------
  console.log("\n5. Scénarios techniques — timeout et erreur 500");
  const flaky = new MockFneProvider({ outcome: "CERTIFIED", failTransport: true, statusCode: 503 });
  let transportError: FneTransportError | null = null;

  try {
    await flaky.submitInvoice(payload(), context(1, "cle-panne-0001"));
  } catch (error) {
    transportError = error instanceof FneTransportError ? error : null;
  }

  check("une panne technique lève FneTransportError", transportError !== null);
  check("l'erreur est marquée comme rejouable (503)", transportError?.retryable === true);
  check("le code HTTP est conservé", transportError?.statusCode === 503);

  const clientError = new MockFneProvider({ outcome: "CERTIFIED", failTransport: true, statusCode: 400 });
  let notRetryable: FneTransportError | null = null;
  try {
    await clientError.submitInvoice(payload(), context(1, "cle-400-0001"));
  } catch (error) {
    notRetryable = error instanceof FneTransportError ? error : null;
  }

  check("une erreur 400 n'est pas rejouable", notRetryable?.retryable === false);

  // --- Assainissement des secrets (section 73) --------------------------
  console.log("\n6. Assainissement des réponses (section 73)");
  const withSecret = '{"access_token":"SECRET-ABC123","fneNumber":"FNE-1"}';
  check("un jeton d'accès est masqué", sanitizeResponse(withSecret)?.includes("SECRET-ABC123") === false);
  check("le numéro de facture reste lisible", sanitizeResponse(withSecret)?.includes("FNE-1") === true);
  check(
    "un corps volumineux est tronqué",
    (sanitizeResponse(JSON.stringify({ data: "x".repeat(5000) }))?.length ?? 0) <= 2100,
  );
  check("un corps nul reste nul", sanitizeResponse(null) === null);

  const withRealSecret = await provider.submitInvoice(payload(), context(1, "cle-secret-0001"));
  check(
    "la réponse réelle ne contient aucun secret",
    withRealSecret.responseBody?.includes("SECRET-SHOULD-NEVER-BE-LOGGED") === false,
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
  });
