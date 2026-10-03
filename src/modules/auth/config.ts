import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { listAccessibleProperties } from "@/modules/tenancy/context";

import { verifyPassword } from "./password";

/**
 * Configuration Auth.js (PROMPTMVP.md sections 39, 69, 74).
 *
 * La session est gérée en base (adapter Prisma) et non par JWT : une
 * session révocable est requise pour qu'une déconnexion ou une suspension de
 * compte soit immédiate (section 74). Un JWT auto-porté ne pourrait pas être
 * révoqué avant son expiration.
 */

const SESSION_MAX_AGE_SECONDS = Number(process.env.AUTH_SESSION_MAX_AGE ?? 43_200);
const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5);
const LOCKOUT_MINUTES = Number(process.env.AUTH_LOCKOUT_MINUTES ?? 15);

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/auth/v2/login",
    error: "/auth/v2/login",
  },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email et mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);

        // Un payload malformé est traité comme un échec d'authentification :
        // on ne distingue pas un client bogué d'un attaquant.
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            passwordHash: true,
            status: true,
            lockedUntil: true,
            failedLoginAttempts: true,
          },
        });

        // Compte inexistant : une vérification est tout de même exécutée
        // pour que le temps de réponse ne révèle pas l'existence du compte
        // (section 69).
        if (!user?.passwordHash) {
          await verifyPassword(
            "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000",
            password,
          );
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        if (user.status === "DISABLED" || user.status === "INVITED") {
          return null;
        }

        const valid = await verifyPassword(user.passwordHash, password);

        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: shouldLock ? 0 : attempts,
              lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
            },
          });

          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        // Un compte sans établissement ne peut pas travailler : la session
        // est refusée plutôt que d'ouvrir un PMS vide et inerte.
        const { properties } = await listAccessibleProperties(user.id);
        if (properties.length === 0) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Enrichit la session avec l'identifiant utilisateur. Sans ce champ,
     * aucun module métier ne pourrait résoudre le tenant.
     */
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    /**
     * Journalise connexions et déconnexions (section 42). L'écriture n'est
     * pas attendue pour ne pas retarder la réponse : un échec d'audit ne
     * doit pas bloquer une authentification valide.
     */
    async signIn({ user }) {
      void writeAuditLog({ userId: user.id, action: "auth.sign_in" });
    },
    async signOut(message) {
      // L'union de types de l'événement expose `session` comme optionnel
      // selon la stratégie : la lecture doit être défensive.
      const session = "session" in message ? message.session : undefined;
      void writeAuditLog({ userId: session?.userId, action: "auth.sign_out" });
    },
  },
} satisfies NextAuthConfig;

/**
 * Écrit une ligne d'audit en best-effort.
 *
 * L'échec d'écriture est volontairement silencieux : le journal d'audit ne
 * doit jamais faire échouer une action métier par ailleurs valide.
 */
async function writeAuditLog(entry: { userId: string | undefined; action: string }): Promise<void> {
  if (!entry.userId) {
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: entry.userId },
      select: { organizationId: true },
    });

    if (!user) {
      return;
    }

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: entry.userId,
        action: entry.action,
        resource: "session",
      },
    });
  } catch {
    // Journalisation best-effort : voir le commentaire ci-dessus.
  }
}

export default authConfig;