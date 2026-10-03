import { hash, verify } from "@node-rs/argon2";

/**
 * Hachage des mots de passe (PROMPTMVP.md section 74).
 *
 * Argon2id est utilisé avec les paramètres par défaut de la bibliothèque,
 * calibrés pour un serveur applicatif classique. Les paramètres ne sont pas
 * abaissés : le PMS stocke des identifiants, et notamment des numéros de
 * documents d'identité, ce qui justifie une dérivation coûteuse.
 *
 * Le coût se règle par variable d'environnement pour permettre d'augmenter
 * les paramètres plus tard sans invalider les mots de passe existants :
 * Argon2 encode ses propres paramètres dans le hash.
 */

const ARGON_OPTIONS = {
  memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 19456),
  timeCost: Number(process.env.ARGON2_TIME_COST ?? 2),
  parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTIONS);
}

/**
 * Vérifie un mot de passe.
 *
 * Retourne toujours `false` plutôt que de lever : un hash corrompu en base
 * ne doit pas provoquer une erreur 500 qui distingue « compte inexistant »
 * de « mot de passe invalide » (section 69 : protection contre
 * l'énumération de comptes).
 */
export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, ARGON_OPTIONS);
  } catch {
    return false;
  }
}