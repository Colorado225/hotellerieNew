"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Fond atmosphérique (pages.md section 18).
 *
 * Quatre couches empilées, toutes purement décoratives et purement GPU :
 *
 * 1. dégradés radiaux — donnent la profondeur de fond ;
 * 2. taches floutées — atténuent les angles morts et évitent l'aplat parfait ;
 * 3. lignes architecturales — une trame très discrète qui évoque une façade ;
 * 4. grain — appliqué par la feuille de style sur le conteneur parent.
 *
 * Ce que la section 18 interdit est respecté : aucune particule, aucune étoile,
 * aucun motif cyberpunk. Les couches sont fixes, seule leur opacité respire.
 */
export function AuthBackdrop() {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1. Dégradés radiaux : bleu nuit profond, cohérent avec les fonds de la palette. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(1200px 800px at 18% 12%, rgba(30,58,95,0.5), transparent 60%), radial-gradient(900px 700px at 82% 88%, rgba(245,184,91,0.07), transparent 62%), linear-gradient(180deg, #0D0F12 0%, #050505 100%)",
        }}
      />

      {/* 2. Taches floutées : mouvements très lents, jamais synchronisés. */}
      {!reducedMotion && (
        <>
          <motion.div
            className="absolute -top-40 -left-32 size-[34rem] rounded-full opacity-25 blur-[120px]"
            style={{ background: "radial-gradient(circle, #1e3a5f 0%, transparent 70%)" }}
            animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 26, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }}
          />
          <motion.div
            className="absolute -right-40 -bottom-48 size-[30rem] rounded-full opacity-[0.18] blur-[130px]"
            style={{ background: "radial-gradient(circle, #f5b85b 0%, transparent 70%)" }}
            animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1, 1.06, 1] }}
            transition={{
              duration: 32,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
              delay: 1.5,
            }}
          />
        </>
      )}

      {/* 3. Lignes architecturales : trame régulière, presque imperceptible. */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          maskImage: "radial-gradient(ellipse at 30% 40%, #000 20%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 30% 40%, #000 20%, transparent 78%)",
        }}
      />

      {/* Vignettage : concentre le regard sur la colonne de formulaire. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}