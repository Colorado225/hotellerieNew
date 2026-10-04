import type { Transition, Variants } from "framer-motion";

/**
 * Variants d'animation partagés par les écrans d'authentification
 * (pages.md sections 7 et 25).
 *
 * Une seule courbe d'accélération est employée dans tout le système :
 * `[0.22, 1, 0.36, 1]`. Mélanger les courbes produirait des démarrages
 * irréguliers, très visibles lorsque plusieurs éléments apparaissent ensemble.
 */
export const AUTH_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Durée de référence d'une apparition (section 7). */
export const AUTH_DURATION = 0.7;

/** Entrée standard : remonte de 15 px en s'opacifiant. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: AUTH_DURATION, ease: AUTH_EASE },
  },
};

/** Entrée marquée, réservée au titre principal (section 7). */
export const fadeUpLarge: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: AUTH_DURATION, ease: AUTH_EASE },
  },
};

/** Conteneur qui orchestre le cascade (sections 7 et 25). */
export const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.08,
    },
  },
};

/** Élément enfant du conteneur : apparaît légèrement avant le suivant. */
export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: AUTH_DURATION, ease: AUTH_EASE },
  },
};

/**
 * Apparition par mot (section 7).
 *
 * L'accentuation porte sur `containerVariants` et `itemVariants` : sans
 * `display: inline-block` sur l'élément, les mots se chevaucheraient au lieu de
 * se succéder.
 */
export const wordContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.18 },
  },
};

export const wordVariants: Variants = {
  hidden: { opacity: 0, y: "0.4em" },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: AUTH_EASE },
  },
};

/** Transition entre deux pages (section 17). */
export const pageVariants: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: AUTH_EASE },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.35, ease: AUTH_EASE },
  },
};

/** Séance d'entrée de la carte de formulaire (section 25, étape 6). */
export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: AUTH_DURATION, ease: AUTH_EASE },
  },
};

/** Transition partagée par les éléments dont l'état change (barre, indicator). */
export const softTransition: Transition = {
  duration: 0.45,
  ease: AUTH_EASE,
};