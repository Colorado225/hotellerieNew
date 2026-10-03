/**
 * Réconciliation de caisse (PROMPTMVP section 56).
 *
 * Fonctions pures : aucun accès base. La section 56 impose qu'à la clôture
 * le système compare l'attendu au compté et fasse apparaître l'écart :
 *
 * ```text
 * Espèces attendues : 850 000
 * Espèces réelles   : 845 000
 * Écart              : -5 000
 * ```
 *
 * Une variance non nulle exige une justification : c'est la seule trace qui
 * distingue une erreur de saisie d'un détournement.
 */

export interface MovementLike {
  type: string;
  amount: bigint;
}

export interface CashReconciliation {
  openingBalance: bigint;
  /** Entrées d'espèces : ventes, paiements, entrées de caisse. */
  cashIn: bigint;
  /** Sorties : remboursements, sorties de caisse. */
  cashOut: bigint;
  /** Solde attendu à la clôture. */
  expectedBalance: bigint;
  countedCash: bigint;
  /** Écart entre l'attendu et le compté, négatif si manque. */
  variance: bigint;
}

/**
 * Calcule la réconciliation d'une session.
 *
 * Seules les entrées et sorties d'**espèces** comptent. Une carte bancaire ou
 * un virement n'entre pas dans la caisse physique : les inclure fausserait
 * le rapprochement entre le PMS et les espèces réellement détenues.
 */
export function reconcile(
  openingBalance: bigint,
  movements: readonly MovementLike[],
  countedCash: bigint,
): CashReconciliation {
  let cashIn = 0n;
  let cashOut = 0n;

  for (const movement of movements) {
    switch (movement.type) {
      case "CASH_IN":
      case "SALE":
      case "PAYMENT":
        cashIn += movement.amount;
        break;
      case "CASH_OUT":
      case "REFUND":
        cashOut += movement.amount;
        break;
      // Un ajustement n'entre ni en entrée ni en sortie : il corrige un
      // relevé, il ne décrit pas un mouvement de fonds.
      default:
        break;
    }
  }

  const expectedBalance = openingBalance + cashIn - cashOut;

  return {
    openingBalance,
    cashIn,
    cashOut,
    expectedBalance,
    countedCash,
    variance: countedCash - expectedBalance,
  };
}