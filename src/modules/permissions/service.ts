import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db";

import { ALL_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "./catalog";

/**
 * Moteur d'autorisation (PROMPTMVP.md sections 7 et 41).
 *
 * Deux principes-guides :
 *
 * 1. Le `propertyId` n'est JAMAIS accepté depuis le client. Il est dérivé
 *    de la session par `getTenantContext`. Un hotels ne peut pas lire ni
 *    modifier les donnees d'un autre, meme en manipulant les identifiants
 *    directement dans l'API (section 7).
 *
 * 2. Une autorisation porte toujours sur une permission « resource.action ».
 *    Le rôle n'est jamais consulté directement par le code metier.
 */

/** Permissions détenues par un utilisateur, calculées une fois par rendu. */
export const getUserPermissions = cache(async (userId: string): Promise<Set<string>> => {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          code: true,
          isSystemRole: true,
          permissions: { select: { permission: { select: { resource: true, action: true } } } },
        },
      },
    },
  });

  const permissions = new Set<string>();

  for (const assignment of assignments) {
    // Un role systeme hors catalogue (donnee.plus ancienne) retombe sur la
    // matrice codee, jamais sur une liste vide silencieuse.
    const granted = assignment.role.permissions.length
      ? assignment.role.permissions.map((entry) => `${entry.permission.resource}.${entry.permission.action}`)
      : assignment.role.code
        ? (SYSTEM_ROLE_PERMISSIONS[assignment.role.code] ?? [])
        : [];

    for (const permission of granted) {
      permissions.add(permission);
    }
  }

  return permissions;
});

/**
 * Verifie qu'un utilisateur detient une permission.
 *
 * Cette fonction ne leve pas d'exception : elle repond. Le controle d'acces
 * effectif est realise par `assertPermission`, qui produit une erreur metier
 * normalisee (section 72).
 */
export async function can(userId: string, permission: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.has(permission);
}

/** Verifie plusieurs permissions a la fois (toutes exigees). */
export async function canAll(userId: string, required: readonly string[]): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return required.every((permission) => permissions.has(permission));
}

/** Verifie qu'au moins une des permissions est detenue. */
export async function canAny(userId: string, required: readonly string[]): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return required.some((permission) => permissions.has(permission));
}

/** Permissions effectives, a plat, pour l'affichage dans l'interface. */
export async function listPermissions(userId: string): Promise<string[]> {
  const permissions = await getUserPermissions(userId);
  return ALL_PERMISSIONS.filter((permission) => permissions.has(permission));
}

/**
 * Determine si une permission exige une portee « toute l'organisation » ou
 * seulement l'etablissement courant. Utilise par le RLS pour elargir ou
 * restreindre la portee des politiques.
 */
export function isOrganizationScoped(permission: string): boolean {
  return permission === "settings.manage" || permission === "users.manage";
}