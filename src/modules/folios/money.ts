/**
 * Calculs financiers purs (PROMPTMVP sections 51 et 116).
 *
 * Ce module ne dépend ni de Prisma, ni de la base, ni du contexte de
 * requête. Il est donc testable directement par un script Node, sans
 * environnement Next.js.
 *
 * Tous les montants sont des `bigint` : le XOF n'a pas de sous-unité, donc
 * 1 = 1 FCFA (section 6). Le calcul de la taxe se fait en arithmétique
 * entière — `(net * 1800) / 10000` sur des `number` perdrait de la précision.
 */

export interface ChargeAmounts {
  netAmount: bigint;
  taxAmount: bigint;
  grossAmount: bigint;
}

/**
 * Calcule les montants d'une prestation (section 51).
 *
 * La taxe s'applique au montant de base puis s'ajoute au brut.
 */
export function computeChargeAmounts(
  quantity: number,
  unitAmount: bigint,
  taxRatePercent: number | null | undefined,
): ChargeAmounts {
  // Quantité × prix sur une échelle fixe, pour éviter tout flottant.
  const scaledQuantity = BigInt(Math.round(quantity * 1_000_000));
  const netAmount = (unitAmount * scaledQuantity) / 1_000_000n;

  if (!taxRatePercent) {
    return { netAmount, taxAmount: 0n, grossAmount: netAmount };
  }

  // Taux exprimé en centièmes de pourcent pour rester entier.
  const rateBasisPoints = BigInt(Math.round(taxRatePercent * 100));
  const taxAmount = (netAmount * rateBasisPoints) / 10_000n;

  return { netAmount, taxAmount, grossAmount: netAmount + taxAmount };
}

export interface PaymentSplit {
  appliedAmount: bigint;
  creditAmount: bigint;
}

export class OverpaymentNotAllowedError extends Error {
  constructor(
    readonly amount: bigint,
    readonly due: bigint,
  ) {
    super(
      "Ce paiement dépasse le solde dû. Activez le trop-perçu pour conserver l'excédent en avoir.",
    );
    this.name = "OverpaymentNotAllowedError";
  }
}

/**
 * Répartit un paiement entre le solde dû et l'avoir (section 116).
 *
 * Le solde dû peut être négatif si un avoir existe déjà : dans ce cas, le
 * paiement solde d'abord cet avoir, ce qui évite de demander deux fois au
 * client ce qu'il a déjà avancé.
 *
 * Règle 6 du §81 : le trop-perçu doit être explicitement autorisé. Le
 * refus par défaut protège l'hôtel d'une saisie involontaire.
 */
export function splitPayment(
  amount: bigint,
  balance: bigint,
  creditBalance: bigint,
  allowOverpayment: boolean,
): PaymentSplit {
  const dueAmount = balance > 0n ? balance : 0n;
  const existingCredit = creditBalance > 0n ? creditBalance : 0n;
  const totalDue = dueAmount + existingCredit;

  // Paiement inférieur ou égal à ce qui est dû : il solde le solde, puis
  // l'avoir existant. Aucun trop-perçu n'est en jeu.
  if (amount <= totalDue) {
    return { appliedAmount: amount, creditAmount: 0n };
  }

  // Le solde est déjà nul et un avoir est disponible : le paiement le
  // reconstitue puis excède. C'est un trop-perçu, donc la même règle
  // s'applique — l'excédent ne doit être conservé en avoir que si
  // l'opérateur l'a explicitement demandé.
  if (!allowOverpayment) {
    throw new OverpaymentNotAllowedError(amount, totalDue);
  }

  return { appliedAmount: totalDue, creditAmount: amount - totalDue };
}