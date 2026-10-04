import type { ReactNode } from "react";

/**
 * Grille commune aux écrans d'authentification.
 *
 * Le layout se limite à la structure : chaque écran compose son propre visuel
 * via `AuthShowcase`. Le panneau et les textes marketing du template
 * d'origine vivaient ici, ce qui exposait l'écran d'inscription à un second
 * fond et affichait des accréditations sans rapport avec le produit.
 */
export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="min-h-dvh">
      <div className="grid min-h-dvh lg:grid-cols-2">{children}</div>
    </main>
  );
}
