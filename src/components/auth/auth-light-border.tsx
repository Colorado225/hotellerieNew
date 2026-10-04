"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Lueur qui parcourt le contour du formulaire (pages.md section 9).
 *
 * L'effet est obtenu par rotation d'un cône de lumière masqué par le fond du
 * formulaire : une seule propriété transform est animée, ce qui la maintient sur
 * le GPU et épargne un recalcul de masque à chaque image.
 *
 * Deux précautions dictées par la section 21 :
 *
 * - seule `transform` est animée ; animer `top` ou `left` provoquerait un
 *   recalcul de mise en page à chaque image ;
 * - la version animée est un unique élément, pas une chaîne de particules : au-delà
 *   d'une particule, l'effet cesse d'être une lumière et devient un bruit visuel.
 *
 * La période varie entre 5 et 8 secondes (section 9) ; 6 s est retenue.
 */
export function AuthLightBorder({ duration = 6 }: { duration?: number }) {
  const reducedMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
      {/*
        Le cône est plus grand que le cadre et décentré : sa rotation fait
        voyager le point le plus lumineux sur les quatre côtés, sans qu'un coin
        ne reste plus lumineux qu'un autre.
      */}
      <motion.div
        className="absolute"
        style={{
          // Dépassement de 25 % : le cône doit dépasser la bordure pour rester
          // continu sur les angles.
          inset: "-25%",
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(245,184,91,0.9) 350deg, transparent 360deg)",
          filter: "blur(10px)",
        }}
        animate={reducedMotion ? undefined : { rotate: 360 }}
        transition={
          reducedMotion
            ? undefined
            : { duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }
        }
      />

      {/*
        Couche de netteté : le flou appliqué au cône est adouci par une seconde
        passe plus serrée, ce qui donne la traînée diffuse demandée sans
        ajouter de bruit visuel.
      */}
      <motion.div
        className="absolute"
        style={{
          inset: "-25%",
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 318deg, rgba(255,225,180,0.55) 352deg, transparent 360deg)",
          filter: "blur(3px)",
          opacity: 0.75,
        }}
        animate={reducedMotion ? undefined : { rotate: 360 }}
        transition={
          reducedMotion
            ? undefined
            : { duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }
        }
      />

      {/*
        Masque : le cône ne doit éclairer que le pourtour, jamais l'intérieur de
        la carte où se trouvent le texte et les champs.

        Le masque est un trou radial : transparent au centre, opaque sur les
        bords, ce qui éteint le cône dans l'aire du formulaire tout en laissant
        la lueur se poser sur le pourtour. Un aplat opaque aurait caché la
        surface vitrée et le fond, et l'effet aurait disparu avec elle.
      */}
      <div
        className="absolute inset-[1.5px] rounded-[25px]"
        style={{
          background: "radial-gradient(circle at center, #08090B 58%, transparent 100%)",
        }}
      />
    </div>
  );
}