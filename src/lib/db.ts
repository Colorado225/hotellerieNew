import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma.
 *
 * En développement, Next.js recharge les modules à chaque hot reload : sans
 * ce cache, on ouvrirait une nouvelle pool de connexions à chaque changement
 * de fichier jusqu'à épuiser le nombre de connexions PostgreSQL.
 *
 * La connexion passe par DATABASE_URL, qui pointe vers le endpoint POOLÉ
 * (PgBouncer) sur les environnements serverless. Les migrations utilisent
 * DIRECT_URL via le bloc `directUrl` du datasource Prisma : elles requièrent
 * des prepared statements au niveau protocole, incompatibles avec le mode
 * transaction de PgBouncer.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Représente le client de transaction passé à `prisma.$transaction`.
 * Les services métier doivent typer leurs paramètres avec ce type pour rester
 * compatibles à la fois avec le client global et avec une transaction.
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface TenantScope {
  organizationId: string;
  propertyId?: string;
  /** Identité de l'utilisateur, journalisée dans les triggers métier. */
  userId?: string;
}

/**
 * Exécute une opération dans une transaction tenant (PROMPTMVP.md section 7).
 *
 * Le contexte est posé via `SET LOCAL` : il reste valable pour la seule
 * transaction courante et disparaît au commit ou au rollback. C'est
 * exactement ce qu'il faut pour que les politiques RLS s'appliquent sans
 * qu'un contexte ne puisse fuir vers une requête ultérieure de la même
 * connexion.
 *
 * `SET LOCAL` requiert d'être dans une transaction : c'est pourquoi cette
 * fonction enveloppe toujours l'appel dans `prisma.$transaction`.
 *
 * L'isolation `Serializable` est imposée : c'est le niveau requis par les
 * scénarios de double réservation et de paiement concurrent (sections 45,
 * 71 et 134).
 */
export async function withTenantContext<T>(
  scope: TenantScope,
  operation: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // set_config(..., true) équivaut à SET LOCAL : la valeur est remise à
      // zéro en fin de transaction. Les paramètres sont passés par
      // interpolation contrôlée : ce sont des UUID déjà validés en amont,
      // jamais une entrée utilisateur brute.
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${scope.organizationId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.property_id', ${scope.propertyId ?? ""}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${scope.userId ?? ""}, true)`;

      return operation(tx as PrismaTransactionClient);
    },
    {
      isolationLevel: "Serializable",
      // Un conflit de sérialisation est attendu dans les courses de
      // réservation : on réessaie plutôt que de renvoyer une erreur 500.
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}

export default prisma;