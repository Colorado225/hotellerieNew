/**
 * Abstraction de la plateforme FNE (PROMPTMVP section 33).
 *
 * Le cahier des charges impose une couche d'indirection explicite :
 *
 * ```text
 * Invoice
 *    ↓
 * InvoiceService
 *    ↓
 * FNEService
 *    ↓
 * FNEProvider
 *    ↓
 * DGI FNE API
 * ```
 *
 * Appeler la DGI directement depuis `InvoiceService` est formellement
 * interdit : la dépendance doit être inversée, afin que le service de
 * facturation ignore totalement le protocole de certification.
 */

import type { FneSubmissionStatus } from "@prisma/client";

/**
 * Catégorie de client telle que la distingue la plateforme FNE.
 *
 * Les règles de conformité diffèrent fortement selon la catégorie : le B2B
 * impose l'NCC, l'email et le téléphone du client, le B2F impose la devise et
 * le taux de change. Deviner la catégorie depuis les données présentes
 * serait hasardeux — mieux vaut qu'elle soit portée explicitement.
 */
export type FneCustomerType = "B2B" | "B2C" | "B2G" | "B2F";

/**
 * Régime d'imposition de l'émetteur.
 *
 * La DGI réserve la facturation de la TVA aux contribuables du réel : RNI
 * (réel normal d'imposition) et RSI (réel simplifié d'imposition). Un
 * établissement soumis à l'impôt synthétique ne peut pas facturer de TVA.
 */
export type FneTaxRegime = "RNI" | "RSI" | "SYNTHETIQUE" | "FORFAIT";

/** Régimes pour lesquels la TVA peut être facturée. */
const REAL_REGIMES: readonly FneTaxRegime[] = ["RNI", "RSI"];

/** Données d'une facture transmises à la plateforme FNE. */
export interface FneInvoicePayload {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: Date;
  /** Établissement émetteur. */
  seller: {
    name: string;
    /**
     * NCC de l'émetteur : 7 chiffres suivis d'une lettre clé en majuscule,
     * sans espace.
     */
    taxIdentifier: string | null;
    rccm: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    /**
     * Régime d'imposition. Facultatif : s'il est renseigné, il est contrôlé.
     * Absent, la validation de TVA est ignorée faute d'information.
     */
    taxRegime?: FneTaxRegime | null;
  };
  /** Client facturé. */
  buyer: {
    name: string;
    /**
     * NCC du client, au même format que celui de l'émetteur. Obligatoire en
     * B2B.
     */
    taxIdentifier: string | null;
    address: string | null;
    /** Format ivoirien : 10 chiffres, sans `+225` ni espace. */
    phone: string | null;
    email: string | null;
    /** Catégorie du client. Par défaut B2C. */
    customerType?: FneCustomerType;
    /**
     * Devise du pays de destination, requise en B2F.
     */
    foreignCurrency?: string | null;
    /** Taux de change vers le XOF, requis en B2F. */
    exchangeRate?: number | null;
  };
  currency: string;
  subtotal: bigint;
  taxAmount: bigint;
  totalAmount: bigint;
  items: {
    description: string;
    quantity: string;
    unitPrice: bigint;
    discountAmount: bigint;
    netAmount: bigint;
    taxCode: string | null;
  }[];
  /** Taxes appliquées, avec leur code et leur taux. */
  taxes: { code: string; ratePercent: number; amount: bigint }[];
}

/** Réponse normalisée de la plateforme. */
export interface FneSubmissionResult {
  status: FneSubmissionStatus;
  /** Numéro de facture normalisée, attribué par la plateforme. */
  fneNumber: string | null;
  certificationReference: string | null;
  qrCodeData: string | null;
  /** Identifiant technique de la requête, pour la traçabilité. */
  requestId: string | null;
  responseCode: number | null;
  /** Réponse brute, à assainir avant journalisation. */
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/** Contexte de corrélation, indispensable au support. */
export interface FneRequestContext {
  /** Identifiant de la tentative, unique par tentative. */
  idempotencyKey: string;
  /** Chaîne de corrélation reliant l'appel à la plateforme. */
  correlationId: string;
  attemptNumber: number;
}

/**
 * Contrat de la plateforme FNE.
 *
 * Toute implémentation — réelle, sandbox ou factice — respecte ce contrat.
 */
export interface FneProvider {
  /** Nom du fournisseur, journalisé avec chaque tentative. */
  readonly name: string;

  /**
   * Soumet une facture à certification.
   *
   * L'implémentation ne doit jamais lever d'exception pour un rejet métier :
   * un rejet est une réponse (`status: REJECTED`), pas une panne. Seules les
   * défaillances techniques — réseau, timeout — remontent en exception pour
   * que le worker puisse réessayer.
   */
  submitInvoice(payload: FneInvoicePayload, context: FneRequestContext): Promise<FneSubmissionResult>;

  /** Vérifie l'état d'une certification par son identifiant externe. */
  checkStatus(fneNumber: string, context: FneRequestContext): Promise<FneSubmissionResult>;
}

/** Erreur technique transitoire : réseau, timeout, 5xx. */
export class FneTransportError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = "FneTransportError";
  }
}

/** Erreur de configuration : credentials absents ou invalides. */
export class FneConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FneConfigurationError";
  }
}

// ---------------------------------------------------------------------------
// Contrôles de conformité DGI
// ---------------------------------------------------------------------------

/**
 * Préfixes bancaires et mobiles en vigueur en Côte d'Ivoire.
 *
 * La DGI impose l'un de ces préfixes pour la facturation B2B, B2C et B2G.
 */
const CI_PHONE_PREFIXES = ["01", "05", "07", "21", "25", "27"] as const;

/** Un NCC ivoirien : sept chiffres puis une lettre clé en majuscule. */
const NCC_PATTERN = /^\d{7}[A-Z]$/;

/**
 * Contrôle le format d'un NCC.
 *
 * Sept chiffres suivis d'une lettre, sans espace. La plateforme refuse les
 * formats « lisibles » du genre `CI-ABJ-1234`, très répandus dans les données
 * de démonstration : c'est précisément le type d'écart que la DGI sanctionne.
 */
export function isValidNcc(ncc: string | null | undefined): boolean {
  return typeof ncc === "string" && NCC_PATTERN.test(ncc.trim());
}

/**
 * Normalise un téléphone ivoirien vers le format attendu par la DGI.
 *
 * Les préfixes `+225` et `00225` ainsi que les séparateurs sont retirés :
 * ces variantes sont courantes en saisie, et les rejeter n'apporterait rien
 * puisque la correction est automatique. Retourne `null` si le numéro ne peut
 * pas être rendu valide.
 */
export function normalizeCiPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  // Ne conserve que les chiffres, puis retire l'indicatif pays ivoirien.
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("00225")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("225") && digits.length > 10) {
    digits = digits.slice(3);
  }

  if (digits.length !== 10) {
    return null;
  }

  if (!CI_PHONE_PREFIXES.some((prefix) => digits.startsWith(prefix))) {
    return null;
  }

  return digits;
}

/** Contrôle le format d'une adresse électronique. */
export function isValidEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// Validation avant envoi
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'une charge de certification est exploitable.
 *
 * La plateforme nationale refuse les factures incomplètes. Mieux vaut
 * détecter le problème avant l'appel qu'après un rejet opaque, d'autant que
 * le rejet distant est définitif alors qu'une erreur locale est corrigeable.
 */
export function validateFnePayload(payload: FneInvoicePayload): string[] {
  const problems: string[] = [];

  if (!payload.invoiceNumber.trim()) {
    problems.push("Numéro de facture manquant.");
  }

  if (!payload.seller.name.trim()) {
    problems.push("Nom de l'établissement émetteur manquant.");
  }

  if (!payload.buyer.name.trim()) {
    problems.push("Nom du client facturé manquant.");
  }

  if (payload.totalAmount <= 0n) {
    problems.push("Montant total nul ou négatif : rien à certifier.");
  }

  // La cohérence arithmétique est vérifiée avant l'envoi : la plateforme
  // rejette les totaux qui ne se recoupent pas.
  if (payload.subtotal + payload.taxAmount !== payload.totalAmount) {
    problems.push(
      `Les totaux ne se recoupent pas : ${payload.subtotal} + ${payload.taxAmount} ≠ ${payload.totalAmount}.`,
    );
  }

  if (payload.items.length === 0) {
    problems.push("Facture sans ligne.");
  }

  // --- Conformité DGI ------------------------------------------------------
  //
  // Ces contrôles portent sur des règles publiées par la DGI et non sur la
  // spec réseau : ils sont donc utilisables dès maintenant, indépendamment de
  // l'accès à la plateforme. Un rejet de conformité expose la clé API, autant
  // le détecter avant l'envoi.

  const { buyer, seller } = payload;
  const customerType = buyer.customerType ?? "B2C";

  // NCC de l'émetteur : obligatoire et strictement formaté.
  if (!seller.taxIdentifier?.trim()) {
    problems.push("NCC de l'établissement émetteur manquant.");
  } else if (!isValidNcc(seller.taxIdentifier)) {
    problems.push(
      `NCC émetteur « ${seller.taxIdentifier} » invalide : sept chiffres puis une lettre en majuscule, sans espace.`,
    );
  }

  // Catégorie du client. Le B2B est le plus exigeant : NCC, email et
  // téléphone sont tous obligatoires.
  if (customerType === "B2B") {
    if (!buyer.taxIdentifier?.trim()) {
      problems.push("NCC du client manquant en facturation B2B.");
    } else if (!isValidNcc(buyer.taxIdentifier)) {
      problems.push(
        `NCC client « ${buyer.taxIdentifier} » invalide : sept chiffres puis une lettre en majuscule, sans espace.`,
      );
    }

    if (!buyer.email?.trim()) {
      problems.push("Adresse électronique du client obligatoire en facturation B2B.");
    } else if (!isValidEmail(buyer.email)) {
      problems.push(`Adresse électronique client « ${buyer.email} » invalide.`);
    }

    if (!buyer.phone?.trim()) {
      problems.push("Téléphone du client obligatoire en facturation B2B.");
    } else if (normalizeCiPhone(buyer.phone) === null) {
      problems.push(
        `Téléphone client « ${buyer.phone} » invalide : dix chiffres commençant par 01, 05, 07, 21, 25 ou 27, sans indicatif pays.`,
      );
    }
  } else if (buyer.phone && normalizeCiPhone(buyer.phone) === null) {
    // Même hors B2B, un numéro présent mais faux est un écart de conformité.
    problems.push(
      `Téléphone client « ${buyer.phone} » invalide : dix chiffres commençant par 01, 05, 07, 21, 25 ou 27, sans indicatif pays.`,
    );
  }

  // B2F : la devise du pays de destination et le taux de change sont requis,
  // y compris pour les zones en franc CFA.
  if (customerType === "B2F") {
    if (!buyer.foreignCurrency?.trim()) {
      problems.push("Devise du pays de destination obligatoire en facturation B2F.");
    }

    if (buyer.exchangeRate === null || buyer.exchangeRate === undefined) {
      problems.push("Taux de change obligatoire en facturation B2F.");
    } else if (!(buyer.exchangeRate > 0)) {
      problems.push(`Taux de change invalide : ${buyer.exchangeRate}.`);
    }
  }

  // TVA : réservée au régime du réel. Le régime étant facultatif dans le
  // payload, un émetteur non renseigné n'est pas bloqué — mais un régime
  // synthétique l'est.
  const hasVat = payload.taxes.some((tax) => tax.amount > 0n);

  if (hasVat && seller.taxRegime && !REAL_REGIMES.includes(seller.taxRegime)) {
    problems.push(
      `La TVA ne peut être facturée que par un contribuable au réel (RNI ou RSI), or l'établissement est au régime ${seller.taxRegime}.`,
    );
  }

  // Lignes : quantités strictement positives et aucune valeur négative. La
  // DGI tolère le négatif uniquement pour le pétrole lampant, cas qui n'a pas
  // lieu d'être dans un PMS hôtelier.
  payload.items.forEach((item, index) => {
    const label = `Ligne ${index + 1}`;

    const quantity = Number.parseFloat(item.quantity);
    if (!Number.isFinite(quantity) || !(quantity > 0)) {
      problems.push(`${label} : quantité « ${item.quantity} » invalide, une valeur positive est exigée.`);
    }

    if (item.unitPrice < 0n) {
      problems.push(`${label} : prix unitaire négatif interdit.`);
    }

    if (item.discountAmount < 0n) {
      problems.push(`${label} : remise négative interdite.`);
    }

    if (item.netAmount < 0n) {
      problems.push(`${label} : montant net négatif interdit.`);
    }
  });

  return problems;
}

/**
 * Assainit une réponse avant journalisation.
 *
 * La section 73 interdit de logger des secrets. Toute réponse pouvant
 * contenir un jeton est réduite aux champs utiles au support, puis tronquée.
 */
export function sanitizeResponse(body: string | null): string | null {
  if (!body) {
    return null;
  }

  const SENSITIVE_KEYS = /"(token|secret|api_?key|password|authorization|access_?token)"\s*:\s*"[^"]*"/gi;

  const redacted = body.replace(SENSITIVE_KEYS, '"$1":"[redacted]"');

  return redacted.length > 2000 ? `${redacted.slice(0, 2000)}…[tronqué]` : redacted;
}
