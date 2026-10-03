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

/** Données d'une facture transmises à la plateforme FNE. */
export interface FneInvoicePayload {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: Date;
  /** Établissement émetteur. */
  seller: {
    name: string;
    taxIdentifier: string | null;
    rccm: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  /** Client facturé. */
  buyer: {
    name: string;
    taxIdentifier: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
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
