/**
 * Erreurs métier normalisées (PROMPTMVP.md section 72).
 *
 * Format de réponse API attendu :
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ROOM_NOT_AVAILABLE",
 *     "message": "La chambre sélectionnée n'est plus disponible.",
 *     "details": {},
 *     "correlationId": "..."
 *   }
 * }
 * ```
 *
 * Une stack trace ne doit jamais atteindre le client : chaque message ici
 * est rédigé pour être lu par un utilisateur métier (réceptionniste,
 * caissier), pas par un développeur.
 */

/** Codes d'erreur stables, exploitables par le client et par les tests. */
export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ROOM_NOT_AVAILABLE: "ROOM_NOT_AVAILABLE",
  ROOM_NOT_ASSIGNABLE: "ROOM_NOT_ASSIGNABLE",
  CAPACITY_EXCEEDED: "CAPACITY_EXCEEDED",
  RESERVATION_NOT_MODIFIABLE: "RESERVATION_NOT_MODIFIABLE",
  INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION",
  PAYMENT_EXCEEDS_BALANCE: "PAYMENT_EXCEEDS_BALANCE",
  INVOICE_FINALIZED: "INVOICE_FINALIZED",
  CASH_SESSION_CLOSED: "CASH_SESSION_CLOSED",
  NIGHT_AUDIT_ALREADY_RUN: "NIGHT_AUDIT_ALREADY_RUN",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  EXTERNAL_SERVICE_UNAVAILABLE: "EXTERNAL_SERVICE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Code HTTP associé à chaque famille d'erreur. */
const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  ROOM_NOT_AVAILABLE: 409,
  ROOM_NOT_ASSIGNABLE: 409,
  CAPACITY_EXCEEDED: 409,
  RESERVATION_NOT_MODIFIABLE: 409,
  INVALID_STATE_TRANSITION: 409,
  PAYMENT_EXCEEDS_BALANCE: 409,
  INVOICE_FINALIZED: 409,
  CASH_SESSION_CLOSED: 409,
  NIGHT_AUDIT_ALREADY_RUN: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  EXTERNAL_SERVICE_UNAVAILABLE: 503,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly correlationId?: string;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Authentification requise.") {
    super(ERROR_CODES.UNAUTHORIZED, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Vous n'avez pas les droits nécessaires pour cette action.") {
    super(ERROR_CODES.FORBIDDEN, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super(ERROR_CODES.NOT_FOUND, `${resource} introuvable.`);
    this.name = "NotFoundError";
  }
}

/**
 * Permission manquante. Le message ne divulgue pas la liste des
 * permissions du rôle : il indique seulement l'action refusée, ce qui évite
 * de cartographier les droits du système depuis l'extérieur.
 */
export class PermissionDeniedError extends DomainError {
  constructor(permission: string) {
    super(ERROR_CODES.FORBIDDEN, "Vous n'êtes pas autorisé à effectuer cette action.", { permission });
    this.name = "PermissionDeniedError";
  }
}

export class RoomNotAvailableError extends DomainError {
  constructor(roomTypeName?: string) {
    super(
      ERROR_CODES.ROOM_NOT_AVAILABLE,
      roomTypeName
        ? `Aucune chambre de type « ${roomTypeName} » n'est disponible pour ces dates.`
        : "Aucune chambre n'est disponible pour ces dates.",
    );
    this.name = "RoomNotAvailableError";
  }
}

export class CapacityExceededError extends DomainError {
  constructor(occupancy: number, maxOccupancy: number) {
    super(
      ERROR_CODES.CAPACITY_EXCEEDED,
      `L'hébergement demandé (${occupancy} personnes) dépasse la capacité de la chambre (${maxOccupancy}).`,
      { occupancy, maxOccupancy },
    );
    this.name = "CapacityExceededError";
  }
}

export class PaymentExceedsBalanceError extends DomainError {
  constructor(amount: bigint, balance: bigint) {
    super(
      ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
      "Le paiement dépasse le solde dû. Utilisez un avoir si un trop-perçu est autorisé.",
      { amount: amount.toString(), balance: balance.toString() },
    );
    this.name = "PaymentExceedsBalanceError";
  }
}

export class InvoiceFinalizedError extends DomainError {
  constructor(invoiceNumber: string) {
    super(
      ERROR_CODES.INVOICE_FINALIZED,
      `La facture ${invoiceNumber} est finalisée et ne peut plus être modifiée.`,
      { invoiceNumber },
    );
    this.name = "InvoiceFinalizedError";
  }
}

/**
 * Données de saisie invalides au sens métier.
 *
 * Diffère de `VALIDATION_ERROR` de la couche HTTP : ici le message est
 * destiné au personnel de réception, pas renvoyé tel quel à un navigateur.
 */
export class ValidationError extends DomainError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(ERROR_CODES.VALIDATION_ERROR, message, details);
    this.name = "ValidationError";
  }
}

/** Type de garde : vérifie qu'une valeur est bien une DomainError. */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}