import { z } from "zod";

/**
 * Schémas de validation du module propriété (PROMPTMVP.md sections 8 et 9).
 *
 * La validation est partagée entre le formulaire côté client et le service
 * métier : un module ne doit jamais valider autrement que le formulaire,
 * sinon les deux divergent.
 */

/** Classification hôtelière ivoirienne (section 31). */
export const hotelClassificationSchema = z.enum(["NO_STAR", "ONE_STAR", "TWO_STAR", "THREE_STAR_PLUS"]);

/** Code ISO 3166-1 alpha-2. */
export const countryCodeSchema = z
  .string()
  .trim()
  .length(2, "Le code pays doit comporter deux lettres.")
  .toUpperCase();

/** Identifiant ISO 4217. */
export const currencySchema = z
  .string()
  .trim()
  .length(3, "Le code devise doit comporter trois lettres.")
  .toUpperCase();

/** Fuseau horaire IANA, validé contre la base de fuseaux du système. */
export const timezoneSchema = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  "Fuseau horaire invalide.",
);

/** Heure locale au format HH:mm. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure attendue au format HH:mm.");

export const updatePropertySchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(120),
  legalName: z.string().trim().max(160).optional().nullable(),
  rccm: z.string().trim().max(40).optional().nullable(),
  taxIdentifier: z.string().trim().max(40).optional().nullable(),
  addressLine1: z.string().trim().max(160).optional().nullable(),
  addressLine2: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  region: z.string().trim().max(80).optional().nullable(),
  district: z.string().trim().max(80).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: countryCodeSchema,
  phone: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email("Adresse email invalide.")
    .optional()
    .nullable()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("URL invalide.")
    .optional()
    .nullable()
    .or(z.literal("")),
  timezone: timezoneSchema,
  currency: currencySchema,
  hotelClassification: hotelClassificationSchema,
  starRating: z.number().int().min(0).max(5).optional().nullable(),
  checkInTime: timeOfDaySchema,
  checkOutTime: timeOfDaySchema,
  logoUrl: z
    .string()
    .trim()
    .url("URL invalide.")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

// ---------------------------------------------------------------------------
// Bâtiments et étages (section 9)
// ---------------------------------------------------------------------------

export const createBuildingSchema = z.object({
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
});

export const createFloorSchema = z.object({
  buildingId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(80),
  number: z.number().int().min(-10).max(200),
});

export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type CreateFloorInput = z.infer<typeof createFloorSchema>;

// ---------------------------------------------------------------------------
// Types de chambres (section 9)
// ---------------------------------------------------------------------------

export const createRoomTypeSchema = z
  .object({
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
    shortDescription: z.string().trim().max(160).optional().nullable(),
    capacityAdults: z.number().int().min(1, "Capacité adulte minimale : 1.").max(20),
    capacityChildren: z.number().int().min(0).max(10),
    baseOccupancy: z.number().int().min(1).max(20),
    maxOccupancy: z.number().int().min(1).max(30),
    bedConfiguration: z.string().trim().max(80).optional().nullable(),
    surfaceArea: z.number().positive("La surface doit être positive.").max(1000).optional().nullable(),
    defaultRate: z.bigint().nonnegative().optional().nullable(),
  })
  .refine((data) => data.baseOccupancy <= data.capacityAdults + data.capacityChildren, {
    message: "L'occupation de base ne peut pas dépasser la capacité totale.",
    path: ["baseOccupancy"],
  })
  .refine((data) => data.maxOccupancy >= data.baseOccupancy, {
    message: "La capacité maximale doit être au moins égale à l'occupation de base.",
    path: ["maxOccupancy"],
  });

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;

// ---------------------------------------------------------------------------
// Chambres (section 9)
// ---------------------------------------------------------------------------

export const createRoomSchema = z.object({
  roomTypeId: z.string().uuid("Type de chambre invalide."),
  buildingId: z.string().uuid().optional().nullable(),
  floorId: z.string().uuid().optional().nullable(),
  number: z.string().trim().min(1, "Le numéro est obligatoire.").max(20),
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
  capacity: z.number().int().min(1).max(30).optional().nullable(),
  floorLocation: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/**
 * Changement de statut d'une chambre (section 10).
 *
 * Toute transition passe par cette validation et laisse une trace dans
 * `room_status_history`.
 */
export const changeRoomStatusSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
  referenceType: z.string().trim().max(40).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
});

export type ChangeRoomStatusInput = z.infer<typeof changeRoomStatusSchema>;
