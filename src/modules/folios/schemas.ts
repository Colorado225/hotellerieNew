import { z } from "zod";

/**
 * Schémas du module folio, charge et paiement (PROMPTMVP sections 51, 53,
 * 116 et 117).
 *
 * Les montants entrants sont des `bigint`. Aucun `number` n'est accepté :
 * une charge saisie en nombre flottant perdrait de la précision dès que le
 * montant cumule plusieurs prestations.
 */

export const folioItemTypeSchema = z.enum([
  "ROOM",
  "BREAKFAST",
  "RESTAURANT",
  "BAR",
  "LAUNDRY",
  "ROOM_SERVICE",
  "SPA",
  "OTHER_SERVICE",
  "DISCOUNT",
  "TAX",
  "ADJUSTMENT",
]);

export const paymentMethodSchema = z.enum([
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "CHEQUE",
  "MOBILE_MONEY",
  "OTHER",
]);

/**
 * Imputation d'une prestation (section 51).
 *
 * Le prix unitaire est demandé explicitement plutôt que déduit d'un
 * catalogue : un PMS de réception doit permettre la saisie libre (tarif
 * négocié, dépannage sur place, prestation exceptionnelle). Le prix par
 * défaut provient du catalogue, l'opérateur peut le corriger.
 */
export const postChargeSchema = z.object({
  folioId: z.string().uuid("Folio introuvable."),
  type: folioItemTypeSchema,
  category: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().min(2, "La description est obligatoire.").max(200),
  quantity: z.number().positive("La quantité doit être strictement positive.").max(999),
  unitAmount: z.bigint().nonnegative("Le prix unitaire ne peut pas être négatif."),
  /** Taux de TVA en pourcentage, si la prestation est soumise à taxe. */
  taxRatePercent: z.number().min(0).max(100).optional().nullable(),
  /** Rattachement à la ligne de réservation à l'origine de la charge. */
  referenceType: z.string().trim().max(40).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type PostChargeInput = z.infer<typeof postChargeSchema>;

/**
 * Annulation d'une charge (section 51).
 *
 * La ligne n'est jamais supprimée : elle passe à l'état void et une
 * écriture compensatoire est créée. Le motif est obligatoire pour que
 * l'audit (§42) reste exploitable.
 */
export const voidChargeSchema = z.object({
  folioItemId: z.string().uuid("Ligne introuvable."),
  reason: z.string().trim().min(3, "Le motif d'annulation est obligatoire.").max(500),
});

export type VoidChargeInput = z.infer<typeof voidChargeSchema>;

/**
 * Encaissement (section 53).
 *
 * `overpayAsCredit` implémente la section 116 : un paiement supérieur au
 * solde crée un avoir plutôt que d'être perdu ou refusé.
 */
export const createPaymentSchema = z
  .object({
    folioId: z.string().uuid("Folio introuvable."),
    amount: z.bigint().positive("Le montant doit être strictement positif."),
    method: paymentMethodSchema,
    reference: z.string().trim().max(120).optional().nullable(),
    externalReference: z.string().trim().max(120).optional().nullable(),
    paidAt: z.coerce.date().optional(),
    /**
     * Affecte l'excédent à un avoir client au lieu de le refuser.
     * Exigé dès que le montant dépasse le solde.
     */
    overpayAsCredit: z.boolean().default(false),
    /** Clé d'idempotence : deux envois identiques ne créent qu'un paiement. */
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .refine((data) => !data.idempotencyKey || data.idempotencyKey.length >= 8, {
    message: "La clé d'idempotence doit faire au moins 8 caractères.",
    path: ["idempotencyKey"],
  });

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Ouverture et clôture de session de caisse (section 34 et 56). */
export const openCashSessionSchema = z.object({
  cashRegisterId: z.string().uuid("Caisse obligatoire."),
  openingBalance: z.bigint().nonnegative("Le solde d'ouverture ne peut pas être négatif."),
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

/**
 * Clôture de caisse (section 56).
 *
 * Une variance non nulle exige une justification : le §56 impose que
 * l'écart soit documenté, pas seulement constaté. Le caractère obligatoire
 * de la justification dépend du montant compté, connu seulement dans la
 * transaction : `assertVarianceJustified` effectue ce contrôle côté service.
 */
export const closeCashSessionSchema = z.object({
  cashSessionId: z.string().uuid("Session obligatoire."),
  countedCash: z.bigint().nonnegative("Le comptage ne peut pas être négatif."),
  varianceReason: z.string().trim().max(500).optional().nullable(),
});

export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;

/** Mouvement de caisse (section 34). */
export const createCashMovementSchema = z.object({
  cashSessionId: z.string().uuid("Session obligatoire."),
  type: z.enum(["SALE", "PAYMENT", "REFUND", "CASH_IN", "CASH_OUT", "ADJUSTMENT"]),
  amount: z.bigint().positive("Le montant doit être strictement positif."),
  reason: z.string().trim().max(300).optional().nullable(),
  referenceType: z.string().trim().max(40).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
});

export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;