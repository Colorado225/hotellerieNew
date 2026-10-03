import { z } from "zod";

/**
 * Schémas du module facture (PROMPTMVP sections 28 et 29).
 *
 * Le client ne fournit aucun montant : tous les totaux sont recalculés à
 * partir des lignes du folio et des règles fiscales en vigueur. Une saisie
 * manuelle du total rendrait possible une facture fausse.
 */

export const invoiceTypeSchema = z.enum(["NORMAL", "DEBIT_NOTE", "CREDIT_NOTE"]);

/** Demande de création d'une facture depuis un folio. */
export const createInvoiceSchema = z.object({
  folioId: z.string().uuid("Folio obligatoire."),
  invoiceType: invoiceTypeSchema.default("NORMAL"),
  dueAt: z.coerce.date().optional().nullable(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * Finalisation d'une facture (section 52).
 *
 * La finalisation verrouille les montants : la règle 7 interdit ensuite toute
 * modification libre.
 */
export const finalizeInvoiceSchema = z.object({
  invoiceId: z.string().uuid("Facture obligatoire."),
});

export type FinalizeInvoiceInput = z.infer<typeof finalizeInvoiceSchema>;

/** Annulation d'une facture non encore certifiée. */
export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().uuid("Facture obligatoire."),
  reason: z.string().trim().min(3, "Le motif est obligatoire.").max(500),
});

export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;