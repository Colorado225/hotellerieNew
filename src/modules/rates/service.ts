import "server-only";

import { prisma, withTenantContext, type PrismaTransactionClient } from "@/lib/db";
import { getTenantContext } from "@/modules/tenancy/context";
import { PermissionDeniedError } from "@/modules/shared/errors";
import { can } from "@/modules/permissions/service";

import {
  computeRoomSubtotal,
  countNights,
  MissingRateError,
  type QuoteResult,
} from "./engine";
import { loadRateCandidates } from "./loader";
import type { QuoteRequest } from "./schemas";

/**
 * Service tarifaire (PROMPTMVP.md section 11).
 *
 * Le service se contente de charger les grilles tarifaires applicables puis
 * de déléguer le calcul aux fonctions pures de `engine.ts`. Toute la logique
 * de tarification reste ainsi testable sans base de données.
 */

const RATE_PERMISSION = "reports.view";

export interface QuoteResultWithContext extends QuoteResult {
  roomTypeId: string;
  arrivalDate: Date;
  departureDate: Date;
  adults: number;
  children: number;
  /** Vrai lorsqu'au moins une nuit n'a pas trouvé de grille tarifaire. */
  hasMissingRate: boolean;
  /** Nuits sans grille, à laide de l'utilisateur si l'affichage l'exige. */
  missingDates?: Date[];
}

/**
 * Calcule le prix des nuitées d'une demande de réservation.
 *
 * L'occupation combinée (adultes + enfants) détermine la grille tarifaire :
 * une chambre dont la grille de base couvre 2 personnes n'est pas proposée au
 * tarif base pour 4 occupants.
 */
export async function quote(request: QuoteRequest): Promise<QuoteResultWithContext> {
  const tenant = await getTenantContext();

  if (!(await can(tenant.userId, RATE_PERMISSION))) {
    throw new PermissionDeniedError(RATE_PERMISSION);
  }

  const occupancy = request.adults + request.children;
  const nights = countNights(request.arrivalDate, request.departureDate);

  return withTenantContext(tenant, async (tx) => {
    const candidates = await loadRateCandidates(
      tx,
      tenant.propertyId,
      request.roomTypeId,
      request.ratePlanId,
      request.arrivalDate,
      request.departureDate,
    );

    try {
      const result = computeRoomSubtotal(
        candidates,
        request.arrivalDate,
        request.departureDate,
        occupancy,
      );

      return {
        ...result,
        hasMissingRate: false,
        roomTypeId: request.roomTypeId,
        arrivalDate: request.arrivalDate,
        departureDate: request.departureDate,
        adults: request.adults,
        children: request.children,
      };
    } catch (error) {
      // L'absence de grille n'est pas une erreur technique : elle remonte
      // comme une absence d'information tarifaire exploitable.
      if (error instanceof MissingRateError) {
        return {
          nights,
          breakdown: [],
          roomSubtotal: 0n,
          currency: "XOF",
          hasMissingRate: true,
          missingDates: error.missingDates,
          roomTypeId: request.roomTypeId,
          arrivalDate: request.arrivalDate,
          departureDate: request.departureDate,
          adults: request.adults,
          children: request.children,
        };
      }
      throw error;
    }
  });
}

/**
 * Devis sans contrôle de permission.
 *
 * Utilisé par le moteur de disponibilité, qui a déjà vérifié les droits et
 * doit pouvoir tester plusieurs prix sans multiplier les contrôles.
 */
export async function quoteUnchecked(
  tx: PrismaTransactionClient,
  propertyId: string,
  request: QuoteRequest,
): Promise<QuoteResult> {
  const candidates = await loadRateCandidates(
    tx,
    propertyId,
    request.roomTypeId,
    request.ratePlanId,
    request.arrivalDate,
    request.departureDate,
  );

  return computeRoomSubtotal(
    candidates,
    request.arrivalDate,
    request.departureDate,
    request.adults + request.children,
  );
}

/** Vérifie qu'un plan de tarif existe et appartient à l'établissement. */
export async function assertRatePlanBelongsToProperty(ratePlanId: string, propertyId: string): Promise<void> {
  const plan = await prisma.ratePlan.findFirst({
    where: { id: ratePlanId, propertyId },
    select: { id: true },
  });

  if (!plan) {
    throw new PermissionDeniedError("reservation.create");
  }
}