import { z } from "zod";

import { currencySchema } from "@/modules/property/schemas";

/**
 * Schémas du moteur tarifaire (PROMPTMVP.md sections 11 et 12).
 *
 * Tous les montants sont des `bigint` : le Zod les valide sans conversion, ce
 * qui évite toute perte de précision due à un passage par un `number`
 * JavaScript. Un tarif de 50 000 FCFA tient sans problème dans un double,
 * mais pas un cumul sur des dizaines de milliers de lignes.
 */

export const mealPlanSchema = z.enum([
  "ROOM_ONLY",
  "BREAKFAST_INCLUDED",
  "HALF_BOARD",
  "FULL_BOARD",
  "ALL_INCLUSIVE",
]);

export const cancellationPenaltyTypeSchema = z.enum([
  "NONE",
  "FIXED_AMOUNT",
  "FIRST_NIGHT",
  "PERCENTAGE",
  "FULL_STAY",
]);

export const createRatePlanSchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(80),
  code: z
    .string()
    .trim()
    .min(1, "Le code est obligatoire.")
    .max(20)
    .toUpperCase()
    .regex(
      /^[A-Z0-9_-]+$/,
      "Le code ne peut contenir que des lettres, chiffres, tirets et underscores.",
    ),
  description: z.string().trim().max(500).optional().nullable(),
  mealPlan: mealPlanSchema,
  cancellationPolicyId: z.string().uuid().optional().nullable(),
  paymentPolicy: z.string().trim().max(40).optional().nullable(),
  isRefundable: z.boolean(),
  isPublic: z.boolean(),
});

export type CreateRatePlanInput = z.infer<typeof createRatePlanSchema>;

export const createSeasonSchema = z
  .object({
    name: z.string().trim().min(2, "Le nom est obligatoire.").max(80),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    priority: z.number().int().min(0).max(100),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "La date de fin doit être postérieure à la date de début.",
    path: ["endDate"],
  });

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;

export const createRatePlanPriceSchema = z
  .object({
    ratePlanId: z.string().uuid(),
    roomTypeId: z.string().uuid(),
    seasonId: z.string().uuid().optional().nullable(),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date(),
    occupancy: z.number().int().min(1, "L'occupation doit être d'au moins 1.").max(30),
    amount: z.bigint().positive("Le tarif doit être strictement positif."),
    currency: currencySchema,
    minimumNights: z.number().int().min(1).max(365).optional().nullable(),
    maximumNights: z.number().int().min(1).max(365).optional().nullable(),
  })
  .refine((data) => data.validTo >= data.validFrom, {
    message: "La date de fin de validité doit être postérieure à la date de début.",
    path: ["validTo"],
  })
  .refine(
    (data) =>
      data.minimumNights === null ||
      data.minimumNights === undefined ||
      data.maximumNights === null ||
      data.maximumNights === undefined ||
      data.minimumNights <= data.maximumNights,
    {
      message: "La durée minimale ne peut pas dépasser la durée maximale.",
      path: ["minimumNights"],
    },
  );

export type CreateRatePlanPriceInput = z.infer<typeof createRatePlanPriceSchema>;

export const createCancellationPolicySchema = z
  .object({
    name: z.string().trim().min(2, "Le nom est obligatoire.").max(80),
    description: z.string().trim().max(500).optional().nullable(),
    deadlineHours: z.number().int().min(0).max(720),
    penaltyType: cancellationPenaltyTypeSchema,
    penaltyValue: z.bigint().nonnegative().optional().nullable(),
    noShowPenaltyType: cancellationPenaltyTypeSchema,
    noShowPenaltyValue: z.bigint().nonnegative().optional().nullable(),
  })
  .refine(
    // Un pourcentage doit être compris entre 0 et 100. La pénalité en
    // montant, elle, n'a pas de borne naturelle.
    (data) =>
      data.penaltyType !== "PERCENTAGE" ||
      (data.penaltyValue !== null && data.penaltyValue !== undefined && data.penaltyValue <= 100n),
    {
      message: "Une pénalité en pourcentage ne peut pas dépasser 100 %.",
      path: ["penaltyValue"],
    },
  )
  .refine(
    (data) =>
      data.noShowPenaltyType !== "PERCENTAGE" ||
      (data.noShowPenaltyValue !== null &&
        data.noShowPenaltyValue !== undefined &&
        data.noShowPenaltyValue <= 100n),
    {
      message: "Une pénalité de no-show en pourcentage ne peut pas dépasser 100 %.",
      path: ["noShowPenaltyValue"],
    },
  );

export type CreateCancellationPolicyInput = z.infer<typeof createCancellationPolicySchema>;

/**
 * Demande de recherche de prix (section 11).
 *
 * Le moteur tarifaire est une fonction pure : il reçoit une période et un
 * nombre d'occupants, et renvoie un prix. Aucun accès base de données ne doit
 * se produire dans l'interface : c'est le rôle du service.
 */
export const quoteRequestSchema = z
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

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;