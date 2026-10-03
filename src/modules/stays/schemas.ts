import { z } from "zod";

/**
 * Schémas du module séjour (PROMPTMVP.md sections 49, 50, 54).
 *
 * Le check-in et le checkout sont les deux opérations les plus sensibles
 * d'un PMS : elles touchent simultanément la réservation, la chambre, le
 * séjour, le folio et le journal d'audit. Leurs schémas sont volontairement
 * stricts.
 */

export const checkInSchema = z.object({
  reservationId: z.string().uuid("Réservation introuvable."),
  roomId: z.string().uuid().optional().nullable(),
  /** Nombre de personnes effectivement présentes, pour le folio. */
  adults: z.number().int().min(1).max(30),
  children: z.number().int().min(0).max(30),
  /** Dépôts et acomptes encaissés à la réception. */
  depositAmount: z.bigint().nonnegative().optional(),
  depositMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "OTHER"]).optional(),
  /** Notes internes, jamais visibles du client. */
  notes: z.string().trim().max(2000).optional().nullable(),
  /**
   * Force le check-in malgré une chambre non prête ou un solde dû. La
   * permission `stay.check_in_override` est vérifiée côté service : ce champ
   * n'accorde rien, il documente une décision.
   */
  overrideReason: z.string().trim().max(500).optional().nullable(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;

/** Changement de chambre (section 50). */
export const changeRoomSchema = z
  .object({
    stayId: z.string().uuid("Séjour introuvable."),
    newRoomId: z.string().uuid("Nouvelle chambre obligatoire."),
    reason: z.string().trim().min(3, "Le motif est obligatoire.").max(500),
  })
  .refine((data) => data.reason.length > 0, {
    message: "Un changement de chambre doit être justifié.",
    path: ["reason"],
  });

export type ChangeRoomInput = z.infer<typeof changeRoomSchema>;

/** Check-out (section 54). */
export const checkOutSchema = z.object({
  stayId: z.string().uuid("Séjour introuvable."),
  /** Prestations de dernière minute à imputer avant de solder. */
  charges: z
    .array(
      z.object({
        type: z.enum([
          "ROOM",
          "BREAKFAST",
          "RESTAURANT",
          "BAR",
          "LAUNDRY",
          "ROOM_SERVICE",
          "SPA",
          "OTHER_SERVICE",
        ]),
        description: z.string().trim().min(2).max(200),
        amount: z.bigint().positive("Le montant doit être strictement positif."),
      }),
    )
    .max(50)
    .optional(),
  /** Encaisse le solde restant avant de solder. */
  payment: z
    .object({
      amount: z.bigint().positive(),
      method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "CHEQUE", "MOBILE_MONEY", "OTHER"]),
      reference: z.string().trim().max(120).optional(),
    })
    .optional(),
  /** Autorise un départ avec solde impayé. Vérifié par le service. */
  overrideReason: z.string().trim().max(500).optional().nullable(),
});

export type CheckOutInput = z.infer<typeof checkOutSchema>;

/** Consultation des arrivées du jour (section 61). */
export const arrivalsQuerySchema = z.object({
  date: z.coerce.date(),
});

export type ArrivalsQuery = z.infer<typeof arrivalsQuerySchema>;

/** Détail d'un séjour pour l'écran front desk. */
export const stayDetailSchema = z.object({
  stayId: z.string().uuid(),
});

export type StayDetailInput = z.infer<typeof stayDetailSchema>;