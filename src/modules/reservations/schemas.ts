import { z } from "zod";

/**
 * Schémas du module réservation (PROMPTMVP.md sections 18, 19 et 20).
 *
 * Le montant d'une réservation n'est jamais fourni par le client : il est
 * recalculé par le moteur tarifaire à partir de la période, du type de
 * chambre et du plan de tarif. Aucun champ `totalAmount` n'apparaît donc
 * dans ces schémas.
 */

export const reservationSourceSchema = z.enum([
  "DIRECT",
  "PHONE",
  "WHATSAPP",
  "WALK_IN",
  "WEBSITE",
  "OTA",
  "AGENCY",
  "CORPORATE",
  "OTHER",
]);

export const guestRoleSchema = z.enum(["PRIMARY", "ADULT", "CHILD", "COMPANION"]);

/** Ligne de réservation : un couple chambre / période / tarif. */
export const reservationRoomInputSchema = z.object({
  roomTypeId: z.string().uuid("Type de chambre obligatoire."),
  roomId: z.string().uuid().optional().nullable(),
  ratePlanId: z.string().uuid("Plan de tarif obligatoire."),
  adults: z.number().int().min(1).max(30),
  children: z.number().int().min(0).max(30),
  arrivalDate: z.coerce.date(),
  departureDate: z.coerce.date(),
  /** Remise soumise à la permission `reservation.override_price`. */
  discount: z
    .object({
      type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
      value: z.bigint().nonnegative(),
      reason: z.string().trim().min(3, "Toute remise doit être justifiée.").max(200),
    })
    .optional()
    .nullable(),
});

/**
 * Demande de création d'une réservation (section 18).
 *
 * Les dates sont validées ensemble : une réservation doit se terminer après
 * son arrivée, sinon elle n'a aucun sens et produirait un nombre de nuits
 * négatif en base.
 */
export const createReservationSchema = z
  .object({
    guestId: z.string().uuid("Client obligatoire."),
    companyId: z.string().uuid().optional().nullable(),
    agencyId: z.string().uuid().optional().nullable(),
    source: reservationSourceSchema,
    channel: z.string().trim().max(60).optional().nullable(),
    externalReference: z.string().trim().max(120).optional().nullable(),
    adults: z.number().int().min(1, "Au moins un adulte est requis.").max(30),
    children: z.number().int().min(0).max(30),
    infants: z.number().int().min(0).max(10),
    specialRequests: z.string().trim().max(2000).optional().nullable(),
    internalNotes: z.string().trim().max(2000).optional().nullable(),
    depositRequired: z.boolean().default(false),
    rooms: z
      .array(reservationRoomInputSchema)
      .min(1, "Une réservation comporte au moins une chambre.")
      .max(20, "Vingt chambres au maximum par réservation."),
    additionalGuests: z
      .array(z.object({ guestId: z.string().uuid(), role: guestRoleSchema }))
      .max(30)
      .optional(),
  })
  // Toutes les chambres d'une réservation partagent la même période : un
  // séjour se gère en une seule unité, sinon disponibilités et facturation
  // deviennent incohérentes.
  .refine(
    (data) =>
      data.rooms.every(
        (room) =>
          room.arrivalDate.getTime() === data.rooms[0].arrivalDate.getTime() &&
          room.departureDate.getTime() === data.rooms[0].departureDate.getTime(),
      ),
    {
      message: "Toutes les chambres d'une réservation doivent partager la même période.",
      path: ["rooms"],
    },
  )
  .refine((data) => data.rooms.every((room) => room.departureDate > room.arrivalDate), {
    message: "La date de départ doit être postérieure à la date d'arrivée.",
    path: ["rooms"],
  });

/** Modification d'une réservation (section 46). */
export const updateReservationSchema = z
  .object({
    arrivalDate: z.coerce.date().optional(),
    departureDate: z.coerce.date().optional(),
    adults: z.number().int().min(1).max(30).optional(),
    children: z.number().int().min(0).max(30).optional(),
    companyId: z.string().uuid().optional().nullable(),
    agencyId: z.string().uuid().optional().nullable(),
    specialRequests: z.string().trim().max(2000).optional().nullable(),
    internalNotes: z.string().trim().max(2000).optional().nullable(),
    depositRequired: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.arrivalDate === undefined ||
      data.departureDate === undefined ||
      data.departureDate > data.arrivalDate,
    {
      message: "La date de départ doit être postérieure à la date d'arrivée.",
      path: ["departureDate"],
    },
  );

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

/** Annulation (section 47). */
export const cancelReservationSchema = z.object({
  reason: z.string().trim().min(3, "Le motif d'annulation est obligatoire.").max(500),
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

/** No-show (section 48). */
export const markNoShowSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

export type MarkNoShowInput = z.infer<typeof markNoShowSchema>;

/** Attribution physique d'une chambre (section 19). */
export const assignRoomSchema = z.object({
  reservationRoomId: z.string().uuid(),
  roomId: z.string().uuid("Chambre obligatoire."),
});

export type AssignRoomInput = z.infer<typeof assignRoomSchema>;

/** Requête de recherche de disponibilité. */
export const availabilityQuerySchema = z
  .object({
    roomTypeId: z.string().uuid().optional().nullable(),
    arrivalDate: z.coerce.date(),
    departureDate: z.coerce.date(),
    adults: z.number().int().min(1).max(30).default(2),
    children: z.number().int().min(0).max(30).default(0),
  })
  .refine((data) => data.departureDate > data.arrivalDate, {
    message: "La date de départ doit être postérieure à la date d'arrivée.",
    path: ["departureDate"],
  });

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

/** Devis (section 11). */
export const quoteQuerySchema = z
  .object({
    roomTypeId: z.string().uuid(),
    ratePlanId: z.string().uuid().optional().nullable(),
    arrivalDate: z.coerce.date(),
    departureDate: z.coerce.date(),
    adults: z.number().int().min(1).max(30),
    children: z.number().int().min(0).max(30),
  })
  .refine((data) => data.departureDate > data.arrivalDate, {
    message: "La date de départ doit être postérieure à la date d'arrivée.",
    path: ["departureDate"],
  });

export type QuoteQueryInput = z.infer<typeof quoteQuerySchema>;
export type CreateReservationInput = z.infer<typeof createReservationSchema>;