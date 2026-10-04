"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { AuthBackdrop } from "./auth-backdrop";
import { AuthBrand } from "./auth-brand";
import { AuthHero } from "./auth-hero";
import { pageVariants } from "./motion";

/*
 * La feuille `auth.css` est importée une seule fois par le layout racine de
 * l'application (`src/app/layout.tsx`). Next.js n'autorise l'import de CSS que
 * depuis un composant serveur de premier niveau : l'importer ici, dans un
 * composant client, échouerait à la compilation.
 */

/**
 * Ossature commune aux deux écrans (pages.md sections 4, 19 et 22).
 *
 * Composition desktop : deux colonnes, 45 % pour la zone visuelle et 55 % pour
 * le formulaire — la partie visuelle légèrement dominante, comme demandé en
 * section 4. Sur mobile, les deux zones s'empilent et le hero se réduit à une
 * bande de 280 px (section 19).
 *
 * `AnimatePresence` porte la transition entre `/login` et `/register`
 * (section 17) : le formulaire sortant glisse vers la droite pendant que le
 * nouveau entre par la gauche. La clé est fournie par l'appelant et correspond à
 * la route, sans quoi React réutiliserait le même nœud et aucune transition ne se
 * produirait.
 */
export function AuthLayout({
  children,
  routeKey,
  badge,
  headline,
}: {
  children: React.ReactNode;
  /** Doit changer à chaque changement d'écran. */
  routeKey: string;
  badge: string;
  headline: readonly string[];
}) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      data-auth-theme
      data-auth-grain
      className="min-h-dvh w-full bg-[#050505] text-white lg:grid lg:grid-cols-[45fr_55fr]"
    >
      <AuthBackdrop />

      {/* Zone visuelle. Sur mobile elle devient une bande au-dessus du
          formulaire plutôt que de disparaître, pour conserver l'ambiance. */}
      <div className="relative z-10 h-[280px] shrink-0 overflow-hidden lg:h-auto lg:min-h-dvh">
        <AuthHero badge={badge} headline={headline} />
      </div>

      {/* Zone d'authentification. */}
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 py-10 sm:px-8 lg:min-h-0">
        <div className="flex w-full max-w-[27rem] flex-col">
          {/* La marque ne figure pas dans la zone visuelle sur mobile : elle
              doit rester accessible au-dessus du formulaire. */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <AuthBrand tagline="PMS" />
          </div>

          <div className="hidden lg:flex lg:justify-end">
            <AuthBrand tagline="PMS" />
          </div>

          <div className="flex flex-1 items-center py-4 lg:py-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={routeKey}
                variants={reducedMotion ? undefined : pageVariants}
                initial={reducedMotion ? false : "initial"}
                animate={reducedMotion ? undefined : "animate"}
                exit={reducedMotion ? undefined : "exit"}
                className="flex w-full justify-center"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Mention de sécurité (section 31). Volontairement sobre : aucune
              promesse technique qui ne serait pas vérifiable. */}
          <p className="mt-8 text-center text-[11px] tracking-wide text-white/35">
            Authentification sécurisée · Données protégées
          </p>
        </div>
      </div>
    </div>
  );
}