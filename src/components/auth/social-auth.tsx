/**
 * Boutons d'authentification sociale (pages.md section 30).
 *
 * Les fournisseurs ne sont affichés que s'ils sont réellement configurés :
 * exposer « Continue with Apple » sans provider correspondant produirait une
 * erreur au clic. Cette décision est cohérente avec le mode d'inscription du
 * PMS, où le compte est attribué par un établissement — un fournisseur social ne
 * fait que prouver la possession d'une adresse.
 *
 * Google est déjà branché côté Auth.js ; Apple ne l'est pas. L'ajouter consiste
 * à enregistrer le provider dans `src/modules/auth/config.ts` puis à le
 * déclarer ici, sans autre modification.
 */
export function SocialAuth({ providers = ["google"] }: { providers?: readonly ("google" | "apple")[] }) {
  const entries = [
    {
      id: "google" as const,
      label: "Continuer avec Google",
      icon: <GoogleGlyph />,
    },
    {
      id: "apple" as const,
      label: "Continuer avec Apple",
      icon: <AppleGlyph />,
    },
  ].filter((entry) => providers.includes(entry.id));

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
          // La route est `/api/auth/signin/:provider` : Auth.js y lit le nom du
          // fournisseur dans le chemin, pas dans le corps de la requête. Le POST
          // sans passer par `signIn()` côté client conserve la protection CSRF
          // fournie par le cookie de jeton.
          <form key={entry.id} action={`/api/auth/signin/${entry.id}`} method="post">
            <input type="hidden" name="callbackUrl" value="/dashboard/front-desk" />

            <button
              type="submit"
              data-auth-secondary
              className="flex w-full cursor-pointer items-center justify-center gap-2.5 font-medium"
            >
              {entry.icon}
              {entry.label}
            </button>
          </form>
        ))}
    </div>
  );
}

/** Marque Google, en couleurs officielles. */
function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
      />
    </svg>
  );
}

/** Marque Apple, monochrome. */
function AppleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M16.36 12.78c.02 2.2 1.94 2.93 1.96 2.94-.02.05-.3 1.04-1 2.06-.6.88-1.23 1.75-2.22 1.77-.97.02-1.28-.57-2.39-.57-1.1 0-1.46.55-2.38.59-.96.03-1.69-.95-2.3-1.82-1.25-1.77-2.2-5-0.92-7.18.64-1.09 1.79-1.78 3.03-1.8.94-.02 1.83.63 2.39.63.56 0 1.62-.78 2.73-.66.46.02 1.76.19 2.6 1.4-.07.04-1.55.91-1.5 2.66ZM14.2 7.6c.47-.57.79-1.37.7-2.16-.68.03-1.5.45-1.99 1.02-.44.5-.82 1.31-.72 2.08.76.06 1.54-.39 2.01-.94Z" />
    </svg>
  );
}