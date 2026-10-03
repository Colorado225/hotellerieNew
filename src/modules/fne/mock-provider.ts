import {
  FneTransportError,
  type FneInvoicePayload,
  type FneProvider,
  type FneRequestContext,
  type FneSubmissionResult,
  sanitizeResponse,
  validateFnePayload,
} from "./provider";

/**
 * Fournisseur FNE factice (sandbox).
 *
 * La section 33 impose un « mode sandbox/mock pour les tests ». Ce
 * fournisseur simule les comportements observables de la plateforme réelle,
 * y compris les pannes, afin que le worker, le circuit breaker et la
 * politique de retry soient exercés sans dépendance externe.
 *
 * Il n'est jamais utilisé en production : `FNE_MODE` vaut `mock` par
 * défaut, et `createFneProvider` refuse ce mode si l'environnement est
 * production.
 */

export interface MockBehaviour {
  /** Réponse systématique : CERTIFIED, REJECTED ou RETRYING. */
  outcome: "CERTIFIED" | "REJECTED";
  /** Motif de rejet, si outcome vaut REJECTED. */
  rejectionReason?: string;
  /** Lever une panne technique, pour tester le retry. */
  failTransport?: boolean;
  /** Statut HTTP simulé lors d'une panne. */
  statusCode?: number;
}

export class MockFneProvider implements FneProvider {
  readonly name = "mock";

  /**
   * Comportement par clé d'idempotence : le même couple (clé, charge)
   * doit produire le même résultat, ce qui permet de vérifier que le
   * système ne duplique pas une certification.
   */
  private readonly results = new Map<string, FneSubmissionResult>();

  /**
   * @param behaviour Scénarios simulés : certification, rejet, ou panne
   *   technique pour exercer le retry et le circuit breaker.
   */
  constructor(private readonly behaviour: MockBehaviour = { outcome: "CERTIFIED" }) {}

  async submitInvoice(
    payload: FneInvoicePayload,
    context: FneRequestContext,
  ): Promise<FneSubmissionResult> {
    const problems = validateFnePayload(payload);
    if (problems.length > 0) {
      // Un rejet de validation est définitif : le réessayer donnerait le
      // même résultat.
      return {
        status: "REJECTED",
        fneNumber: null,
        certificationReference: null,
        qrCodeData: null,
        requestId: null,
        responseCode: 422,
        responseBody: JSON.stringify({ problems }),
        errorCode: "INVALID_PAYLOAD",
        errorMessage: problems.join(" "),
      };
    }

    // Idempotence : une clé déjà traitée retourne le même résultat, sans
    // nouvelle certification.
    const existing = this.results.get(context.idempotencyKey);
    if (existing) {
      return existing;
    }

    if (this.behaviour.failTransport && context.attemptNumber === 1) {
      throw new FneTransportError(
        "Plateforme FNE injoignable (simulée)",
        this.behaviour.statusCode === undefined || this.behaviour.statusCode >= 500,
        this.behaviour.statusCode ?? null,
      );
    }

    if (this.behaviour.failTransport) {
      throw new FneTransportError(
        "Plateforme FNE injoignable (simulée)",
        true,
        this.behaviour.statusCode ?? 503,
      );
    }

    if (this.behaviour.outcome === "REJECTED") {
      const result: FneSubmissionResult = {
        status: "REJECTED",
        fneNumber: null,
        certificationReference: null,
        qrCodeData: null,
        requestId: `req-${context.idempotencyKey}`,
        responseCode: 200,
        responseBody: JSON.stringify({
          message: this.behaviour.rejectionReason ?? "Rejet simulé",
          correlationId: context.correlationId,
        }),
        errorCode: "REJECTED_BY_PLATFORM",
        errorMessage: this.behaviour.rejectionReason ?? "Rejet simulé",
      };

      this.results.set(context.idempotencyKey, result);
      return result;
    }

    const fneNumber = `FNE-${payload.invoiceNumber.replace(/\D/g, "")}`;
    const certificationReference = `CERT-${context.idempotencyKey.slice(0, 12)}`;

    const result: FneSubmissionResult = {
      status: "CERTIFIED",
      fneNumber,
      certificationReference,
      qrCodeData: `data:image/png;base64,MOCK_QR_${certificationReference}`,
      requestId: `req-${context.idempotencyKey}`,
      responseCode: 200,
      responseBody: JSON.stringify({
        fneNumber,
        certificationReference,
        correlationId: context.correlationId,
        // Un jeton simulé : il vérifie que l'assainissement fonctionne.
        access_token: "SECRET-SHOULD-NEVER-BE-LOGGED",
      }),
      errorCode: null,
      errorMessage: null,
    };

    this.results.set(context.idempotencyKey, result);

    return { ...result, responseBody: sanitizeResponse(result.responseBody) };
  }

  async checkStatus(
    fneNumber: string,
    _context: FneRequestContext,
  ): Promise<FneSubmissionResult> {
    return {
      status: "CERTIFIED",
      fneNumber,
      certificationReference: null,
      qrCodeData: null,
      requestId: null,
      responseCode: 200,
      responseBody: JSON.stringify({ fneNumber }),
      errorCode: null,
      errorMessage: null,
    };
  }
}