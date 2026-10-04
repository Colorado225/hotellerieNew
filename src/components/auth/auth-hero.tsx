"use client";

import { motion, useReducedMotion } from "framer-motion";

import { wordContainer, wordVariants } from "./motion";

/**
 * Hero visuel (pages.md sections 5 et 6).
 *
 * La spécification demande une photographie d'architecture contemporaine. Le
 * projet ne contient aucun actif image : `public/` ne contient que de la
 * documentation, et aucune banque d'images ne doit être introduite sans
 * contrôle de licence. La zone visuelle est donc composée en CSS et SVG —
 * dégradés, silhouettes de tours, reflets — ce qui évite toute dépendance
 * externe tout en respectant la composition demandée : image quasi pleine
 * hauteur, couches superposées, texte toujours lisible.
 *
 * Pour passer à une photographie réelle, remplacer le contenu de `<figure>` par
 * une `next/image` : les couches de lisibilité (dégradé, vignette) doivent rester
 * au-dessus de l'image, et rien d'autre ne change.
 */

interface AuthHeroProps {
  /** Accroche principale, découpée en lignes. */
  headline: readonly string[];
  /** Texte du badge supérieur. */
  badge: string;
}

export function AuthHero({ headline, badge }: AuthHeroProps) {
  const reducedMotion = useReducedMotion();

  return (
    <figure className="relative h-full min-h-[280px] overflow-hidden lg:min-h-0">
      {/* Couche 1 : ciel profond et dégradé de lags. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #16273d 0%, #0d1b2c 42%, #050608 100%)",
        }}
      />

      {/* Couche 2 : halo lumineux d'horizon, très diffus. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 42% at 62% 72%, rgba(245,184,91,0.16) 0%, transparent 68%), radial-gradient(ellipse 90% 50% at 30% 30%, rgba(120,160,210,0.14) 0%, transparent 70%)",
        }}
      />
{/* Couche 3 : silhouette de skyline. Tracé SVG, aucune ressource externe. */}
      <svg
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[62%] w-full"
        preserveAspectRatio="xMidYMax slice"
        viewBox="0 0 800 420"
        fill="none"
      >
        <defs>
          <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2c42" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#060a10" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="towerFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16243a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#05080d" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Rangs lointains : plus bas contraste, ils donnent la profondeur. */}
        <g fill="url(#towerFar)">
          <rect x="20" y="210" width="64" height="210" />
          <rect x="96" y="176" width="48" height="244" />
          <rect x="604" y="196" width="58" height="224" />
          <rect x="676" y="232" width="72" height="188" />
        </g>

        {/* Rang principal. */}
        <g fill="url(#tower)">
          <rect x="160" y="140" width="76" height="280" rx="2" />
          <rect x="248" y="96" width="92" height="324" rx="2" />
          <rect x="352" y="168" width="64" height="252" rx="2" />
          <rect x="428" y="60" width="80" height="360" rx="3" />
          <rect x="520" y="152" width="70" height="268" rx="2" />
        </g>

        {/* Fenêtres : grille régulière, très discrète. */}
        <g fill="rgba(245,200,140,0.16)">
          {[248, 288, 328, 368, 408].map((y) => (
            <rect key={`a-${y}`} x="446" y={y} width="6" height="8" rx="1" />
          ))}
          {[130, 166, 202, 238].map((y) => (
            <rect key={`b-${y}`} x="172" y={y} width="6" height="8" rx="1" />
          ))}
          {[178, 214, 250, 286, 322].map((y) => (
            <rect key={`c-${y}`} x="372" y={y} width="5" height="7" rx="1" />
          ))}
        </g>
      </svg>

      {/* Couche 4 : reflets verticaux, comme la lumière sur une façade vitrée. */}
      <div
        className="absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, transparent 3px, transparent 9px)",
        }}
      />

      {/* Couche 5 : voile sombre sous le texte. Sans lui, le titre deviendrait
          illisible sur les fenêtres allumées. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(5,5,5,0.82) 0%, rgba(5,5,5,0.52) 40%, rgba(5,5,5,0.88) 100%)",
        }}
      />

      {/* Contenu textuel, apparition mot à mot (section 7). */}
      <motion.div
        className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14"
        variants={wordContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.span
          className="w-fit rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-medium tracking-[0.18em] text-white/85 uppercase backdrop-blur-sm"
          variants={wordVariants}
        >
          {badge}
        </motion.span>

        <div className="max-w-xl">
          <h1 className="text-[clamp(2.5rem,4.6vw,5rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-white">
            {headline.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`} className="block overflow-hidden">
                {line.split(" ").map((word, wordIndex) => (
                  <motion.span
                    key={`${word}-${wordIndex}`}
                    className="inline-block"
                    variants={wordVariants}
                  >
                    {word}
                    {wordIndex < line.split(" ").length - 1 ? " " : ""}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          <motion.div
            className="mt-8 h-px w-24 origin-left bg-gradient-to-r from-[#F5B85B] to-transparent"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </motion.div>
    </figure>
  );
}