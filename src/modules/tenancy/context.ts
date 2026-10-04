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

/**
 * Établissements auxquels l'utilisateur a accès, selon ses rôles.
 *
 * `user_roles` reste lisible sans contexte RLS — la politique y compare par
 * l'utilisateur authentifié — mais `properties` est protégée par
 * `organization_isolation` et ne renvoie aucune ligne si `app.organization_id`
 * n'est pas positionné. La lecture doit donc être faite dans une transaction
 * où ce contexte est posé, sinon la fonction renverrait systématiquement zéro
 * et l'utilisateur serait refusé à tort.
 *
 * Cette fonction est appelée à des moments où aucun contexte tenant n'existe
 * encore : authentification, résolution de session. Elle ne peut pas supposer
 * que l'appelant a déjà ouvert une transaction.
 */
export const listAccessibleProperties = cache(async (userId: string): Promise<AccessiblePropertiesResult> => {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    select: {
      propertyId: true,
      role: { select: { isSystemRole: true, code: true, organizationId: true } },
    },
  });

  // Aucun rôle : rien à résoudre, et aucune organisation connue pour poser un
  // contexte. Le RLS ne pourrait de toute façon rien laisser passer.
  if (assignments.length === 0) {
    return { properties: [], isOrganizationScoped: false, organizationId: null };
  }

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

  // Lecture des établissements dans une transaction où le contexte RLS de
  // l'organisation est positionné. Sans cela, la politique
  // `organization_isolation` ne laisserait passer aucune ligne.
  const properties: AccessibleProperty[] = organizationId
    ? await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

        return tx.property.findMany({
          where: isOrganizationScoped
            ? { organizationId, deletedAt: null, status: "ACTIVE" }
            : { id: { in: scopedIds }, organizationId, deletedAt: null, status: "ACTIVE" },
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
      })
    : [];

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