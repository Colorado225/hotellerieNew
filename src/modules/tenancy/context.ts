import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/modules/shared/errors";

/**
 * Résolution du contexte tenant (PROMPTMVP.md section 7).
 *
 * Le `propertyId` utilisé par toute opération métier provient
 * exclusivement de la session de l'utilisateur authentifié. Il n'est
 * jamais lu depuis un corps de requête, un query parameter ou un en-tête :
 * un hôtel A ne peut donc pas atteindre les données d'un hôtel B même en
 * forgeant des identifiants dans l'API.
 *
 * La sélection d'établissement s'effectue via un cookie de session
 * (`lagoonkey_property`), lui-même validé contre la liste des
 * établissements accessibles à l'utilisateur. Un cookie invalide est
 * ignoré, il ne lève jamais d'erreur : l'utilisateur retombe simplement
 * sur son établissement principal.
 */

export interface TenantContext {
  userId: string;
  organizationId: string;
  propertyId: string;
  /** Vrai si l'utilisateur détient un rôle couvrant tout le périmètre. */
  isOrganizationScoped: boolean;
}

export const PROPERTY_COOKIE = "lagoonkey_property";

interface AccessibleProperty {
  id: string;
  name: string;
  code: string;
  timezone: string;
  currency: string;
  businessDate: Date;
}

export interface AccessiblePropertiesResult {
  properties: AccessibleProperty[];
  isOrganizationScoped: boolean;
  organizationId: string | null;
}

/** Établissements auxquels l'utilisateur a accès, selon ses rôles. */
export const listAccessibleProperties = cache(async (userId: string): Promise<AccessiblePropertiesResult> => {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    select: {
      propertyId: true,
      role: { select: { isSystemRole: true, code: true, organizationId: true } },
    },
  });

  // Un rôle système ou un rôle sans portée donne accès à toute l'organisation.
  const isOrganizationScoped = assignments.some(
    (assignment) =>
      assignment.propertyId === null ||
      assignment.role.isSystemRole ||
      assignment.role.code === "SUPER_ADMIN" ||
      assignment.role.code === "OWNER",
  );

  const organizationId = assignments[0]?.role.organizationId ?? null;

  const scopedIds = assignments
    .map((assignment) => assignment.propertyId)
    .filter((propertyId): propertyId is string => propertyId !== null);

  const properties: AccessibleProperty[] = await prisma.property.findMany({
    where: isOrganizationScoped
      ? { organizationId: organizationId ?? undefined, deletedAt: null, status: "ACTIVE" }
      : { id: { in: scopedIds }, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      code: true,
      timezone: true,
      currency: true,
      businessDate: true,
    },
    orderBy: { name: "asc" },
  });

  return { properties, isOrganizationScoped, organizationId };
});

/**
 * Retourne le contexte tenant de la requête courante.
 *
 * Lève `UnauthorizedError` si l'appelant n'est pas authentifié et
 * `ForbiddenError` s'il n'a accès à aucun établissement.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const userId = await getSessionUserId();

  if (!userId) {
    throw new UnauthorizedError();
  }

  const { properties, isOrganizationScoped, organizationId } = await listAccessibleProperties(userId);

  if (properties.length === 0) {
    throw new ForbiddenError("Aucun établissement ne vous est attribué.");
  }

  // Next.js 16 expose les en-têtes déjà décodés : `headers().get()` renvoie
  // un string, pas un objet `{ value }`.
  const cookieStore = await headers();
  const requestedPropertyId = cookieStore.get(PROPERTY_COOKIE);

  // Le cookie n'est jamais accepté tel quel : il doit correspondre à un
  // établissement réellement accessible à cet utilisateur.
  const selected = properties.find((property) => property.id === requestedPropertyId) ?? properties[0];

  if (!organizationId) {
    throw new ForbiddenError("Organisation introuvable pour cet utilisateur.");
  }

  return {
    userId,
    organizationId,
    propertyId: selected.id,
    isOrganizationScoped,
  };
});

/**
 * Impose un établissement précis. Utilisé par les opérations naturalisées
 * (administration système) et par le traitement des jobs de fond, où aucun
 * contexte de session n'existe.
 */
export const getTenantContextFor = cache(async (propertyId: string): Promise<TenantContext> => {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, organizationId: true },
  });

  if (!property) {
    throw new ForbiddenError("Établissement introuvable.");
  }

  return {
    userId: "system",
    organizationId: property.organizationId,
    propertyId: property.id,
    isOrganizationScoped: true,
  };
});

/** Identifiant de l'utilisateur de la session, ou null. */
async function getSessionUserId(): Promise<string | null> {
  // Import direct de @/lib/auth : il ré-exporte `auth` depuis Auth.js. Un
  // import dynamique depuis le fichier de configuration créerait un cycle.
  const { auth } = await import("@/lib/auth");
  const session = await auth();

  return session?.user?.id ?? null;
}