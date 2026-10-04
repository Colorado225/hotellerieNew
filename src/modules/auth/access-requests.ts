import "server-only";

import { z } from "zod";

import { hashPassword } from "@/modules/auth/password";
import { prisma } from "@/lib/db";

/**
 * Demandes d'accès déposées depuis le formulaire public (`/register`).
 *
 * Ce service ne crée **aucun compte** : il enregistre une demande en attente
 * d'instruction. La session reste impossible tant qu'un établissement n'a pas
 * approuvé, car `authorize` refuse tout utilisateur dépourvu de rôle — et aucun
 * rôle n'est créé ici.
 *
 * Le mot de passe est haché à la réception (Argon2id, même algorithme que
 * l'authentification) puis repris tel quel au moment de l'approbation, où il
 * devient le `password_hash` du compte. Il n'est jamais stocké en clair, ni
 * journalisé, ni renvoyé.
 */

const requestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(12).max(200),
  type: z.enum(["OWNER", "MANAGER", "AGENT"]),
});

export interface SubmitAccessRequestInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  type: "OWNER" | "MANAGER" | "AGENT";
}

export type SubmitAccessRequestResult =
  | { ok: true }
  | { ok: false; reason: "already_pending" | "already_active" | "invalid" };

/**
 * Dépose une demande d'accès.
 *
 * Le refus en cas de demande déjà en attente n'est pas une contrainte
 * d'unicité arbitraire : il évite qu'un tiers puisse sonder quels emails sont
 * connus du service. L'interface reçoit un message générique dans les deux cas
 * (déjà en attente, ou adresse inconnue), pour ne rien divulguer.
 *
 * La seule distinction révélée est le compte déjà actif : son propriétaire en
 * connaît déjà l'existence.
 */
export async function submitAccessRequest(
  input: SubmitAccessRequestInput,
): Promise<SubmitAccessRequestResult> {
  const parsed = requestSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, reason: "invalid" };
  }

  const { firstName, lastName, email, password, type } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // Un compte actif porte déjà l'accès : la demande n'a pas lieu d'être.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });

  if (existingUser) {
    return { ok: false, reason: "already_active" };
  }

  // Demande en attente : la réponse reste générique côté interface.
  const pending = await prisma.accessRequest.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" }, status: "PENDING" },
    select: { id: true },
  });

  if (pending) {
    return { ok: false, reason: "already_pending" };
  }

  // Le hachage est calculé avant l'insertion. L'index unique partiel sur les
  // demandes en attente constitue la vraie barrière anti-spam : le contrôle
  // ci-dessus n'en est que la forme lisible, avec un message exploitable.
  const passwordHash = await hashPassword(password);

  // L'insertion passe par une requête brute plutôt que par `prisma.create` :
  // Prisma termine ses insertions par un `RETURNING`, évalué sous la politique
  // de lecture, qui refuse une demande tant qu'elle n'est pas rattachée à un
  // établissement. Le dépôt public n'a pas à être lisible — seule la confirmation
  // d'écriture l'intéresse.
  await prisma.$executeRaw`
    INSERT INTO "access_requests"
      ("id", "first_name", "last_name", "email", "password_hash", "type", "status", "created_at", "updated_at")
    VALUES
      (gen_random_uuid(), ${firstName}, ${lastName}, ${normalizedEmail}, ${passwordHash},
       ${type}::"AccessRequestType", 'PENDING', now(), now())
  `;

  // Aucune relecture : la politique de lecture refuse toute demande non
  // rattachée, y compris celle que l'on vient d'écrire. La confirmation de
  // l'écriture est portée par le code de retour de l'insertion ; l'identifiant
  // n'a pas d'usage métier, la demande étant retrouvée par email.
  return { ok: true };
}

/**
 * Compte les demandes en attente, pour l'écran d'administration.
 *
 * Doit être appelé dans un contexte RLS explicite : la politique de lecture ne
 * laisse voir que les demandes rattachées à l'organisation courante.
 */
export async function countPendingRequests(): Promise<number> {
  return prisma.accessRequest.count({ where: { status: "PENDING" } });
}