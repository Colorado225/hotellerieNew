import type { PrismaTransactionClient } from "@/lib/db";

import type { RateCandidate } from "./engine";

/**
 * Chargement des grilles tarifaires (PROMPTMVP.md section 11).
 *
 * Isolé dans son propre module parce que le moteur de disponibilité a besoin
 * de lui autant que le service de réservation. Le laisser dans le service
 * créerait une dépendance circulaire entre les deux modules.
 */
export async function loadRateCandidates(
  tx: PrismaTransactionClient,
  propertyId: string,
  roomTypeId: string,
  ratePlanId: string | null | undefined,
  arrivalDate: Date,
  departureDate: Date,
): Promise<RateCandidate[]> {
  const rows = await tx.ratePlanPrice.findMany({
    where: {
      propertyId,
      roomTypeId,
      // La grille doit couvrir au moins une nuit de la période.
      validFrom: { lte: departureDate },
      validTo: { gte: arrivalDate },
      // Sans plan imposé, seuls les plans publics et actifs sont candidats.
      ...(ratePlanId ? { ratePlanId } : { ratePlan: { isActive: true, isPublic: true } }),
    },
    select: {
      amount: true,
      currency: true,
      validFrom: true,
      validTo: true,
      occupancy: true,
      seasonId: true,
      minimumNights: true,
      maximumNights: true,
      season: { select: { priority: true } },
    },
  });

  return rows.map((row) => ({
    amount: row.amount,
    currency: row.currency,
    validFrom: row.validFrom,
    validTo: row.validTo,
    occupancy: row.occupancy,
    seasonId: row.seasonId,
    seasonPriority: row.season?.priority ?? null,
    minimumNights: row.minimumNights,
    maximumNights: row.maximumNights,
    fromSeason: row.seasonId !== null,
  }));
}