/**
 * Moteur de taxation (PROMPTMVP sections 30 et 126).
 *
 * Fonctions pures : aucune base, aucune date système. Les règles sont
 * fournies en paramètre.
 *
 * La section 30 impose que les règles fiscales ne soient jamais codées en
 * dur dans l'interface : elles vivent en base, versionnées par date
 * d'effet. Cette fonction applique donc une liste de règles, elle ne
 * connaît aucun taux.
 *
 * La section 126 distingue les taxes selon leur assiette :
 *   - sur le prix HT ;
 *   - incluses dans le prix affiché (le client voit 18 %, l'hôtel reçoit
 *     moins) ;
 *   - par personne et par nuit, comme la taxe communale de nuitée.
 */

export interface TaxRuleInput {
  code: string;
  /** Taux en pourcentage, ou null si la taxe est forfaitaire. */
  ratePercent: number | null;
  /** Montant fixe, utilisé lorsque le taux est absent. */
  fixedAmount: bigint | null;
  /**
   * Vrai si la taxe est incluse dans le prix annoncé au client : elle se
   * déduit alors du montant brut au lieu de s'y ajouter.
   */
  isInclusive: boolean;
}

export interface TaxComputation {
  /** Montant net de taxe, à reporter sur la facture. */
  netAmount: bigint;
  taxAmount: bigint;
  grossAmount: bigint;
  /** Détail par règle, indispensable pour la facture et l'audit. */
  breakdown: {
    code: string;
    baseAmount: bigint;
    ratePercent: number | null;
    amount: bigint;
    inclusive: boolean;
  }[];
}

/**
 * Applique un ensemble de règles fiscales à un montant.
 *
 * Les taxes exclusives s'ajoutent au net. Les taxes incluses se déduisent
 * du prix affiché, ce qui change la base de calcul : un montant TTC de
 * 118 000 avec 18 % inclus donne un net de 100 000, pas 118 000.
 */
export function applyTaxRules(
  amount: bigint,
  rules: readonly TaxRuleInput[],
): TaxComputation {
  if (amount < 0n) {
    throw new Error("Le montant à taxer ne peut pas être négatif.");
  }

  const breakdown: TaxComputation["breakdown"] = [];

  let exclusiveTotal = 0n;
  let inclusiveTotal = 0n;

  for (const rule of rules) {
    let baseAmount: bigint;
    let taxAmount: bigint;

    if (rule.ratePercent !== null) {
      if (rule.isInclusive) {
        // Prix affiché = base × (1 + taux). La base se retrouve en
        // divisant : une facture de 118 000 TTC à 18 % vaut 100 000 HT.
        // Le calcul se fait en bigint avec arrondi au franc supérieur,
        // un hôtel ne facturant jamais en dessous du montant exact.
        const rate = BigInt(Math.round(rule.ratePercent * 100));
        baseAmount = (amount * 10_000n) / (10_000n + rate);
        taxAmount = amount - baseAmount;
      } else {
        baseAmount = amount;
        taxAmount = (baseAmount * BigInt(Math.round(rule.ratePercent * 100))) / 10_000n;
      }
    } else if (rule.fixedAmount !== null) {
      // Taxe forfaitaire : par personne et par nuit par exemple.
      baseAmount = amount;
      taxAmount = rule.fixedAmount;
    } else {
      // Règle incomplète : elle est ignorée plutôt que de produire un
      // montant faux. Une configuration partielle ne doit pas fausser une
      // facture.
      continue;
    }

    breakdown.push({
      code: rule.code,
      baseAmount,
      ratePercent: rule.ratePercent,
      amount: taxAmount,
      inclusive: rule.isInclusive,
    });

    if (rule.isInclusive) {
      inclusiveTotal += taxAmount;
    } else {
      exclusiveTotal += taxAmount;
    }
  }

  const netAmount = amount - inclusiveTotal;

  return {
    netAmount,
    taxAmount: exclusiveTotal + inclusiveTotal,
    grossAmount: netAmount + exclusiveTotal + inclusiveTotal,
    breakdown,
  };
}

/**
 * Calcule la taxe communale de nuitée (section 31).
 *
 * Le montant dépend de la classification de l'établissement, pas de la
 * chambre : un hôtel 3 étoiles paie la même taxe pour toutes ses chambres.
 * Les valeurs 2026 (500 / 1 000 / 1 500 / 2 000 FCFA) sont des données de
 * configuration, jamais du code.
 */
export function computeNightTax(
  amountPerNight: bigint,
  nights: number,
): bigint {
  if (amountPerNight < 0n) {
    throw new Error("Le montant de la taxe de nuitée ne peut pas être négatif.");
  }

  return amountPerNight * BigInt(Math.max(nights, 0));
}