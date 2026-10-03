/**
 * Moteur de tarification (PROMPTMVP.md section 11).
 *
 * Ce module ne contient que des fonctions pures : aucun accès à la base, à
 * la date système ou au fuseau de l'établissement. Tout ce qui lui est
 * nécessaire est fourni en paramètre.
 *
 * Cette séparation a une raison précise : les règles tarifaires sont la
 * partie du PMS la plus bombardée de corrections (saisons, tarifs de groupe,
 * tarifs d'agence, promotions). Les tester sans base de données est la seule
 * façon d'en couvrir les cas limites à coût constant, et la seule façon
 * d'éviter qu'une correction tarifaire casse l'inventaire.
 *
 * Tous les montants sont des `bigint` en XOF (section 6).
 */

const MS_PER_DAY = 86_400_000;

/** Ramène une date à minuit UTC. */
export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Ajoute un nombre de jours. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Nombre de nuits entre deux dates, la date de départ étant exclusive.
 *
 * Le calcul se fait sur des dates UTC midnight : c'est ainsi qu'un décalage
 * de fuseau ne fait pas varier le nombre de nuits d'une réservation.
 */
export function countNights(arrivalDate: Date, departureDate: Date): number {
  return Math.round((startOfDay(departureDate).getTime() - startOfDay(arrivalDate).getTime()) / MS_PER_DAY);
}

/** Liste des nuits couvertes par un séjour. */
export function enumerateNights(arrivalDate: Date, departureDate: Date): Date[] {
  const nights: Date[] = [];
  let cursor = startOfDay(arrivalDate);
  const end = startOfDay(departureDate);

  while (cursor < end) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return nights;
}

// ---------------------------------------------------------------------------
// Tarification
// ---------------------------------------------------------------------------

/** Tarif applicable à une nuit donnée. */
export interface ApplicableRate {
  amount: bigint;
  currency: string;
  /** Vrai si le tarif provient d'une saison. */
  fromSeason: boolean;
}

export interface RateCandidate extends ApplicableRate {
  validFrom: Date;
  validTo: Date;
  occupancy: number;
  seasonId: string | null;
  seasonPriority: number | null;
  minimumNights: number | null;
  maximumNights: number | null;
}

export interface ResolvedRate {
  /** Tarif par nuit retenu, ou null si aucune grille ne s'applique. */
  nightlyRate: ApplicableRate | null;
  /** Grille retenue, utile pour expliquer le prix à l'utilisateur. */
  matchedRate: RateCandidate | null;
  /** Raison pour laquelle aucune grille ne s'applique. */
  reason?: "NO_RATE_DEFINED" | "OCCUPANCITY" | "DATE_RANGE";
}

/**
 * Résout le tarif applicable à une nuit.
 *
 * Ordre de résolution :
 *   1. Les tarifs de saison écrasent les tarifs de hors-saison.
 *   2. À priorité égale, la grille la plus récente gagne : une grille
 *      créée récemment est normalement une correction tarifaire.
 *   3. L'occupation demandée doit être couverte par la grille.
 *
 * Le départage par priorité de saison est explicite : le cahier des charges
 * prévoit que les saisons se recouvrent, avec une priorité qui arbitre.
 */
export function resolveNightlyRate(
  candidates: readonly RateCandidate[],
  night: Date,
  occupancy: number,
  totalNights: number,
): ResolvedRate {
  const nightDay = startOfDay(night);

  const applicable = candidates.filter((candidate) => {
    if (candidate.validFrom > nightDay || candidate.validTo < nightDay) {
      return false;
    }

    // L'occupation demandée doit être couverte par la grille : une grille
    // d'occupation base 2 ne s'applique pas à quatre personnes.
    if (occupancy > candidate.occupancy) {
      return false;
    }

    if (candidate.minimumNights !== null && totalNights < candidate.minimumNights) {
      return false;
    }
    if (candidate.maximumNights !== null && totalNights > candidate.maximumNights) {
      return false;
    }

    return true;
  });

  if (applicable.length === 0) {
    return {
      nightlyRate: null,
      matchedRate: null,
      reason: candidates.length > 0 ? "OCCUPANCITY" : "NO_RATE_DEFINED",
    };
  }

  const best = applicable.reduce((winner, candidate) => {
    const winnerPriority = winner.seasonPriority ?? -1;
    const candidatePriority = candidate.seasonPriority ?? -1;

    if (candidatePriority !== winnerPriority) {
      return candidatePriority > winnerPriority ? candidate : winner;
    }

    if (candidate.validFrom.getTime() !== winner.validFrom.getTime()) {
      return candidate.validFrom > winner.validFrom ? candidate : winner;
    }

    // En dernier ressort, la grille la plus spécifique en occupation.
    return candidate.occupancy > winner.occupancy ? candidate : winner;
  });

  return {
    nightlyRate: { amount: best.amount, currency: best.currency, fromSeason: best.fromSeason },
    matchedRate: best,
  };
}

// ---------------------------------------------------------------------------
// Devis
// ---------------------------------------------------------------------------

export interface NightBreakdown {
  date: Date;
  amount: bigint;
  fromSeason: boolean;
}

export interface QuoteResult {
  nights: number;
  /** Détail par nuit, nécessaire pour expliquer le prix au client. */
  breakdown: NightBreakdown[];
  /** Total des nuitées, avant taxes et remise. */
  roomSubtotal: bigint;
  currency: string;
}

export class MissingRateError extends Error {
  constructor(readonly missingDates: Date[]) {
    super(
      `Aucune grille tarifaire ne s'applique pour ${missingDates.length} nuit(s) de ce séjour.`,
    );
    this.name = "MissingRateError";
  }
}

/**
 * Calcule le sous-total des nuitées d'un séjour.
 *
 * La période est découpée nuit par nuit : une réservation à cheval sur deux
 * saisons est facturée au tarif de chaque nuit, pas au tarif de l'une des
 * deux. C'est le comportement attendu d'un hôtel, et la raison pour
 * laquelle cette fonction existe plutôt qu'un simple `nights × tarif`.
 *
 * Lève `MissingRateError` si une seule nuit n'a pas de tarif : facturer un
 * séjour à un tarif incomplet produirait un montant faux, ce qui est pire
 * qu'un refus.
 */
export function computeRoomSubtotal(
  candidates: readonly RateCandidate[],
  arrivalDate: Date,
  departureDate: Date,
  occupancy: number,
): QuoteResult {
  const nights = enumerateNights(arrivalDate, departureDate);

  if (nights.length === 0) {
    throw new MissingRateError([]);
  }

  const breakdown: NightBreakdown[] = [];
  const missing: Date[] = [];
  let currency = "XOF";

  for (const night of nights) {
    const resolved = resolveNightlyRate(candidates, night, occupancy, nights.length);

    if (resolved.nightlyRate === null) {
      missing.push(night);
      continue;
    }

    currency = resolved.nightlyRate.currency;
    breakdown.push({
      date: night,
      amount: resolved.nightlyRate.amount,
      fromSeason: resolved.nightlyRate.fromSeason,
    });
  }

  if (missing.length > 0) {
    throw new MissingRateError(missing);
  }

  const roomSubtotal = breakdown.reduce((total, night) => total + night.amount, 0n);

  return { nights: nights.length, breakdown, roomSubtotal, currency };
}

// ---------------------------------------------------------------------------
// Remises (section 111)
// ---------------------------------------------------------------------------

export interface AppliedDiscount {
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: bigint;
  amount: bigint;
}

/**
 * Applique une remise sur un montant.
 *
 * Le montant final reste reconstructible : la fonction renvoie les éléments
 * ayant produit la remise, pour être journalisés tels quels.
 *
 * Le calcul en pourcentage se fait intégralement en `bigint`. Écrire
 * `(subtotal * value) / 100` sur des `number` losingait de la précision sur
 * les montants élevés du XOF.
 */
export function applyDiscount(
  subtotal: bigint,
  discount: { type: "PERCENTAGE" | "FIXED_AMOUNT"; value: bigint } | null | undefined,
): { netAmount: bigint; applied: AppliedDiscount | null } {
  if (!discount || discount.value === 0n) {
    return { netAmount: subtotal, applied: null };
  }

  if (discount.type === "PERCENTAGE") {
    const amount = (subtotal * discount.value) / 100n;
    const netAmount = subtotal - amount;

    return {
      netAmount: netAmount < 0n ? 0n : netAmount,
      applied: { type: "PERCENTAGE", value: discount.value, amount },
    };
  }

  const amount = discount.value > subtotal ? subtotal : discount.value;

  return {
    netAmount: subtotal - amount,
    applied: { type: "FIXED_AMOUNT", value: discount.value, amount },
  };
}