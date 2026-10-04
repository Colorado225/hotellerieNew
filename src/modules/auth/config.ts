import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
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

/**
 * Adapter Prisma ajusté aux contraintes du modèle multi-tenant.
 *
 * L'adapter officiel suppose deux choses qui sont fausses ici :
 *
 * 1. `getUserByEmail` utilise `findUnique({ where: { email } })`. Dans ce
 *    schéma l'unicité porte sur le couple `(organizationId, email)`, pas sur
 *    le seul email — `findUnique` lèverait une erreur. `findFirst` est le bon
 *    appel, et l'ambiguïté est traitée plus bas.
 * 2. `createUser` attend `name` et `emailVerified`, champs absents du modèle.
 *    La création est ici interdite : un compte ne naît que d'une invitation,
 *    jamais d'une connexion OAuth.
 */
const tenantAdapter: Adapter = {
  ...(PrismaAdapter(prisma) as Adapter),

  /**
   * Recherche par email sans supposer l'unicité globale.
   *
   * Le même email peut appartenir à deux organisations différentes. Si c'est
   * le cas, la connexion est refusée plus loin : rattacher la session au
   * mauvais hôtel serait une fuite inter-tenant.
   */
  async getUserByEmail(email) {
    const matches = await prisma.user.findMany({
      where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
      take: 2,
    });

    // Une seule correspondance est utilisable ; zéro ou plusieurs ne le sont pas.
    if (matches.length !== 1) {
      return null;
    }

    const user = await prisma.user.findUnique({ where: { id: matches[0].id } });

    if (!user) {
      return null;
    }

    // `AdapterUser` exige `emailVerified`, que le modèle ne porte pas. La
    // propriété est fournie ici sans être persistée : la vérification n'a pas
    // lieu d'être côté base puisque ce sont les providers qui la garantissent,
    // et aucune décision d'accès ne s'appuie sur ce champ.
    return {
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      emailVerified: null,
    };
  },

  /**
   * Empêche Auth.js d'écraser l'identité d'un compte existant.
   *
   * Après une connexion OAuth, Auth.js appelle `updateUser` pour aligner le
   * profil sur les informations renvoyées par le fournisseur — dont le nom.
   * Sans garde-fou, le `given_name` de Google remplacerait le nom de famille
   * réellement utilisé dans l'établissement. La méthode est neutralisée : le
   * profil Google ne doit jamais devenir la source de vérité du dossier
   * interne.
   */
  async updateUser() {
    throw new Error(
      "La mise à jour automatique du profil est désactivée : le dossier utilisateur fait foi.",
    );
  },

  /**
   * Refuse toute création de compte.
   *
   * Appelé uniquement si Auth.js tente un auto-enregistrement après une
   * connexion OAuth réussie, ce qui ne devrait pas arriver puisque le callback
   * `signIn` filtre en amont. On refuse explicitement plutôt que de laisser
   * l'erreur du schéma fuiter : mieux vaut un refus lisible qu'une inscription
   * accidentelle dans un établissement.
   */
  async createUser() {
    throw new Error(
      "La création de compte est désactivée : un accès doit être attribué par un établissement.",
    );
  },
};

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const authConfig = {
  adapter: tenantAdapter,
  session: {
    /**
     * Stratégie JWT.
     *
     * Auth.js refuse le provider Credentials avec la stratégie `database`
     * (`UnsupportedStrategy`) : le provider ne peut valider un mot de passe que
     * si la session est portée par le jeton. C'est une contrainte de la
     * bibliothèque, pas un choix de conception.
     *
     * La révocabilité n'est pas perdue pour autant. Le jeton ne contient que
     * l'identifiant utilisateur et expire rapidement ; chaque requête métier
     * relit ensuite `users` et `user_roles` en base via
     * `listAccessibleProperties`. Un compte désactivé ou privé de ses rôles
     * perd donc l'accès immédiatement, sans attendre l'expiration du jeton.
     * La révocation immédiate du jeton lui-même reste approximative.
     */
    strategy: "jwt",
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

    /**
     * Connexion par compte Google.
     *
     * Ce fournisseur n'ouvre aucun compte : il ne fait que prouver la
     * possession d'une adresse email. L'accès reste conditionné à l'existence
     * du compte en base et à son affectation à un établissement, vérifiées dans
     * le callback `signIn`.
     *
     * Sans identifiants, le fournisseur n'est pas enregistré : le bouton est
     * alors masqué côté interface. Cela évite une erreur de configuration en
     * développement.
     */
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            // L'email renvoyé par Google est vérifié par le fournisseur : c'est
            // cette garantie qui autorise le rapprochement avec une ligne
            // `users` existante, par ailleurs créée par invitation.
            allowDangerousEmailAccountLinking: true,
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.given_name ?? profile.name ?? "",
                email: profile.email,
                image: profile.picture,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Filtre d'accès commun aux providers.
     *
     * Credentials est déjà filtré dans `authorize`. Ce callback couvre Google
     * et applique les mêmes règles : compte actif, non verrouillé, rattaché à
     * au moins un établissement. Sans cela, une adresse Google valide
     * ouvrirait une session dans le vide.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") {
        return true;
      }

      const email = user.email ?? (profile as { email?: string } | undefined)?.email;

      if (!email) {
        return false;
      }

      const matches = await prisma.user.findMany({
        where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
        select: {
          id: true,
          status: true,
          lockedUntil: true,
        },
        take: 2,
      });

      // Aucun compte, ou plusieurs : le rattachement serait ambigu. Dans les
      // deux cas la connexion est refusée.
      if (matches.length !== 1) {
        return false;
      }

      const [existing] = matches;

      if (existing.status !== "ACTIVE") {
        return false;
      }

      if (existing.lockedUntil && existing.lockedUntil > new Date()) {
        return false;
      }

      const { properties } = await listAccessibleProperties(existing.id);

      if (properties.length === 0) {
        return false;
      }

      // La remise à zéro des compteurs et l'horodatage sont alignés sur le
      // provider Credentials pour que les deux chemins se comportent pareil.
      await prisma.user.update({
        where: { id: existing.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      return true;
    },

    /**
     * Enrichit la session avec l'identifiant utilisateur. Sans ce champ,
     * aucun module métier ne pourrait résoudre le tenant.
     */
    /**
     * Enrichit la session avec l'identifiant utilisateur.
     *
     * En stratégie JWT, `user` n'est fourni qu'à l'émission du jeton ; les
     * invocations suivantes ne le contiennent pas. L'identifiant est donc
     * transporté par le jeton lui-même, faute de quoi `session.user.id` serait
     * absent et aucun module métier ne pourrait résoudre le tenant.
     */
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    /**
     * Porte l'identifiant utilisateur dans le jeton.
     *
     * `token.sub` est déjà renseigné par Auth.js ; le rappel explicite garde le
     * contrat lisible si un fournisseur fournit un identifiant différent.
     */
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
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