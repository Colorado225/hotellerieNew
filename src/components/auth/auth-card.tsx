"use client";

import { motion, useReducedMotion } from "framer-motion";

import { AuthLightBorder } from "./auth-light-border";

/**
 * Carte de formulaire vitrée (pages.md sections 8, 9 et 10).
 *
 * Trois effets superposés, chacun isolé dans son composant :
 *
 * - le verre (`data-auth-glass`) porte la matière : translucidité, flou,
 *   bordure, ombre ;
 * - `AuthLightBorder` porte la lueur qui parcourt le contour ;
 * - le halo respire derrière la carte, très lentement.
 *
 * La lueur doit rester visible : elle est placée sous le contenu mais au-dessus
 * du fond, et la carte n'a pas de fond opaque qui la masquerait.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="relative w-full max-w-[27rem]">
      {/* Halo : respiration très lente (section 10). */}
      <motion.div
        aria-hidden="true"
        data-auth-glow
        className="pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 rounded-full"
        animate={reducedMotion ? undefined : { scale: [1, 1.04, 1], opacity: [0.4, 0.65, 0.4] }}
        transition={
          reducedMotion
            ? undefined
            : { duration: 5, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
        }
      />

      <div className="relative">
        {/* Lueur : même rayon que la carte, placée dessous. */}
        <div className="absolute -inset-px rounded-[26px]">
          <AuthLightBorder />
        </div>

        {/* Verre. Le fond est légèrement plus dense que dans la feuille de
            style pour laisser passer la lueur sans nuancer le texte. */}
        <div
          data-auth-glass
          className="relative rounded-[26px] border border-white/[0.09] px-8 py-9 sm:px-10 sm:py-10"
        >
          {children}
        </div>
      </div>
    </div>
  );
}