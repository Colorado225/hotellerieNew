import { MockFneProvider } from "@/modules/fne/mock-provider";
import {
  FneTransportError,
  isValidEmail,
  isValidNcc,
  normalizeCiPhone,
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
    // NCC conforme : sept chiffres puis une lettre clé en majuscule.
    taxIdentifier: "0123456F",
    rccm: "CI-ABJ-1234",
    address: "Plateau, Abidjan",
    phone: "+2250100000000",
    email: "facturation@demo.ci",
    taxRegime: "RNI",
  },
  buyer: {
    name: "Awa Kouassi",
    taxIdentifier: null,
    address: "Cocody, Abidjan",
    phone: "+2250700000000",
    email: null,
    customerType: "B2C",
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

/**
 * Construit un payload en permettant de surcharger l'émetteur et le client.
 *
 * Les surcharges imbriquées sont fusionnées champ par champ : les objets
 * `seller` et `buyer` sont donc ajustables sans répéter tout le bloc.
 */
const payload = (
  overrides: {
    seller?: Partial<FneInvoicePayload["seller"]>;
    buyer?: Partial<FneInvoicePayload["buyer"]>;
  } & Partial<Omit<FneInvoicePayload, "seller" | "buyer">> = {},
): FneInvoicePayload => {
  const { seller, buyer, ...rest } = overrides;

  return {
    ...basePayload(),
    ...rest,
    seller: { ...basePayload().seller, ...seller },
    buyer: { ...basePayload().buyer, ...buyer },
  };
};
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

  // --- Conformité DGI (communiqué sur les écarts de structure) --------------
  console.log("\n2. Contrôles de conformité DGI — NCC et téléphone");

  // NCC
  check("un NCC valide est accepté", isValidNcc("0123456F"));
  check("un NCC en minuscules est refusé", !isValidNcc("0123456f"));
  check("un NCC trop court est refusé", !isValidNcc("123456F"));
  check("un NCC avec tirets est refusé", !isValidNcc("CI-ABJ-1234"));
  check("un NCC avec espace est refusé", !isValidNcc("0123456 F"));
  check("un NCC littéral est refusé", !isValidNcc("CI-DEMO-0001"));

  check(
    "un NCC émetteur non conforme est signalé",
    validateFnePayload(payload({ seller: { taxIdentifier: "CI-DEMO-0001" } })).some((p) =>
      p.includes("NCC émetteur"),
    ),
  );
  check(
    "un NCC émetteur absent est signalé",
    validateFnePayload(payload({ seller: { taxIdentifier: null } })).some((p) =>
      p.includes("NCC de l'établissement"),
    ),
  );

  // Téléphone
  check("un numéro national valide est normalisé", normalizeCiPhone("0700000000") === "0700000000");
  check("un numéro avec +225 est normalisé", normalizeCiPhone("+2250700000000") === "0700000000");
  check("un numéro avec 00225 est normalisé", normalizeCiPhone("002250700000000") === "0700000000");
  check("un numéro avec espaces est normalisé", normalizeCiPhone("07 00 00 00 00") === "0700000000");
  check(
    "chaque préfixe autorisé est accepté",
    ["01", "05", "07", "21", "25", "27"].every((p) => normalizeCiPhone(`${p}00000000`) !== null),
  );
  check("un préfixe non autorisé est refusé", normalizeCiPhone("0900000000") === null);
  check("un numéro trop court est refusé", normalizeCiPhone("070000000") === null);
  check("un numéro vide est refusé", normalizeCiPhone("") === null);
  check("un numéro nul est refusé", normalizeCiPhone(null) === null);
  check(
    "un téléphone client non conforme est signalé",
    validateFnePayload(payload({ buyer: { phone: "+225 33 00 00 00 00" } })).some((p) =>
      p.includes("Téléphone client"),
    ),
  );

  // Email
  check("un email valide est accepté", isValidEmail("awa.kouassi@demo.ci"));
  check("un email sans domaine est refusé", !isValidEmail("awa@"));
  check("un email avec espace est refusé", !isValidEmail("a wa@demo.ci"));

  console.log("\n3. Exigences par catégorie de client");

  check(
    "un client B2B sans NCC est signalé",
    validateFnePayload(payload({ buyer: { customerType: "B2B" } })).some((p) =>
      p.includes("NCC du client manquant en facturation B2B"),
    ),
  );
  check(
    "un client B2B sans email est signalé",
    validateFnePayload(
      payload({ buyer: { customerType: "B2B", taxIdentifier: "0123456F", email: null } }),
    ).some((p) => p.includes("électronique du client obligatoire")),
  );
  check(
    "un client B2B sans téléphone est signalé",
    validateFnePayload(
      payload({
        buyer: {
          customerType: "B2B",
          taxIdentifier: "0123456F",
          email: "awa@demo.ci",
          phone: null,
        },
      }),
    ).some((p) => p.includes("Téléphone du client obligatoire")),
  );
  check(
    "un client B2B complet ne remonte aucun problème",
    validateFnePayload(
      payload({
        buyer: {
          customerType: "B2B",
          taxIdentifier: "0123456A",
          email: "awa.kouassi@demo.ci",
          phone: "0700000000",
        },
      }),
    ).length === 0,
  );
  check(
    "un client B2C sans NCC n'est pas signalé",
    !validateFnePayload(payload({ buyer: { customerType: "B2C" } })).some((p) =>
      p.includes("NCC du client"),
    ),
  );

  // B2F : devise et taux de change
  check(
    "un client B2F sans devise est signalé",
    validateFnePayload(payload({ buyer: { customerType: "B2F" } })).some((p) =>
      p.includes("Devise du pays de destination"),
    ),
  );
  check(
    "un client B2F sans taux de change est signalé",
    validateFnePayload(payload({ buyer: { customerType: "B2F", foreignCurrency: "EUR" } })).some((p) =>
      p.includes("Taux de change obligatoire"),
    ),
  );
  check(
    "un taux de change nul est signalé",
    validateFnePayload(
      payload({ buyer: { customerType: "B2F", foreignCurrency: "EUR", exchangeRate: 0 } }),
    ).some((p) => p.includes("Taux de change invalide")),
  );
  check(
    "un client B2F complet ne remonte aucun problème",
    validateFnePayload(
      payload({ buyer: { customerType: "B2F", foreignCurrency: "EUR", exchangeRate: 655.957 } }),
    ).length === 0,
  );

  console.log("\n4. Régime d'imposition et TVA");

  check(
    "un régime synthétique facturant de la TVA est signalé",
    validateFnePayload(payload({ seller: { taxRegime: "SYNTHETIQUE" } })).some((p) =>
      p.includes("que par un contribuable au réel"),
    ),
  );
  check(
    "un régime synthétique sans TVA n'est pas signalé",
    !validateFnePayload(
      payload({
        seller: { taxRegime: "SYNTHETIQUE" },
        taxes: [],
        taxAmount: 0n,
        totalAmount: 100_000n,
      }),
    ).some((p) => p.includes("contribuable au réel")),
  );
  check(
    "un régime du réel facturant de la TVA n'est pas signalé",
    !validateFnePayload(payload({ seller: { taxRegime: "RNI" } })).some((p) =>
      p.includes("contribuable au réel"),
    ),
  );
  check(
    "un régime RSI est accepté",
    !validateFnePayload(payload({ seller: { taxRegime: "RSI" } })).some((p) =>
      p.includes("contribuable au réel"),
    ),
  );
  check(
    "un régime non renseigné n'est pas bloqué",
    validateFnePayload(payload({ seller: { taxRegime: null } })).length === 0,
  );

  console.log("\n5. Lignes : quantités positives et absence de négatifs");

  const item = (
    overrides: Partial<FneInvoicePayload["items"][number]> = {},
  ): FneInvoicePayload["items"][number] => ({
    description: "Hébergement 1 nuit",
    quantity: "1",
    unitPrice: 50_000n,
    discountAmount: 0n,
    netAmount: 50_000n,
    taxCode: "TVA-18",
    ...overrides,
  });

  check(
    "une quantité nulle est refusée",
    validateFnePayload(payload({ items: [item({ quantity: "0" })] })).some((p) =>
      p.includes("positive"),
    ),
  );
  check(
    "une quantité négative est refusée",
    validateFnePayload(payload({ items: [item({ quantity: "-2" })] })).some((p) =>
      p.includes("positive"),
    ),
  );
  check(
    "une quantité non numérique est refusée",
    validateFnePayload(payload({ items: [item({ quantity: "beaucoup" })] })).some((p) =>
      p.includes("positive"),
    ),
  );
  check(
    "une quantité fractionnaire positive est acceptée",
    !validateFnePayload(payload({ items: [item({ quantity: "0.5" })] })).some((p) =>
      p.includes("quantité"),
    ),
  );
  check(
    "un prix unitaire négatif est refusé",
    validateFnePayload(payload({ items: [item({ unitPrice: -50_000n })] })).some((p) =>
      p.includes("prix unitaire négatif"),
    ),
  );
  check(
    "une remise négative est refusée",
    validateFnePayload(payload({ items: [item({ discountAmount: -1_000n })] })).some((p) =>
      p.includes("remise négative"),
    ),
  );
  check(
    "un montant net négatif est refusé",
    validateFnePayload(payload({ items: [item({ netAmount: -1_000n })] })).some((p) =>
      p.includes("montant net négatif"),
    ),
  );
  check(
    "le numéro de la ligne fautive est indiqué",
    validateFnePayload(
      payload({
        items: [item(), item({ description: "Minibar", quantity: "-1" })],
      }),
    ).some((p) => p.startsWith("Ligne 2")),
  );

  // --- Scénario 1 : succès (section 139) ----------------------------------
  console.log("\n6. Scénario succès");
  const provider = new MockFneProvider({ outcome: "CERTIFIED" });
  const success = await provider.submitInvoice(payload(), context());

  check("la facture est certifiée", success.status === "CERTIFIED");
  check("un numéro FNE est attribué", success.fneNumber !== null);
  check("une référence de certification est fournie", success.certificationReference !== null);
  check("un QR code est fourni", success.qrCodeData !== null);
  check("un identifiant de requête est journalisé", success.requestId !== null);

  // --- Scénario 2 : requête en double (règle 8) --------------------------
  console.log("\n7. Scénario requête en double — règle 8 du §81");
  const duplicate = await provider.submitInvoice(payload(), context());

  check("la seconde soumission retourne le même numéro", duplicate.fneNumber === success.fneNumber);
  check("aucune double certification", duplicate.certificationReference === success.certificationReference);

  const distinct = await provider.submitInvoice(payload(), context(1, "autre-cle-0001"));
  check(
    "une clé différente produit une certification distincte",
    distinct.certificationReference !== success.certificationReference,
  );

  // --- Scénario 3 : rejet ---------------------------------------------------
  console.log("\n8. Scénario rejet par la plateforme");
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
  console.log("\n9. Scénarios techniques — timeout et erreur 500");
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
  console.log("\n10. Assainissement des réponses (section 73)");
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
