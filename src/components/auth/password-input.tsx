"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, Lock } from "lucide-react";
import { forwardRef, useState } from "react";

import { Input } from "@/components/ui/input";

import { AuthFieldLabel } from "./password-strength";

/**
 * Champ mot de passe avec bascule de visibilité (pages.md sections 14 et 15).
 *
 * L'icône est décorative et masquée aux lecteurs d'écran : le bouton porte déjà
 * `aria-pressed` et un libellé qui annonce l'action, ce qui est plus utile
 * qu'un nom d'icône.
 *
 * La rotation de l'icône lors du basculement est portée par AnimatePresence ;
 * elle est supprimée si l'utilisateur demande une réduction des animations.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    placeholder?: string;
    autoComplete?: string;
    invalid?: boolean;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    value?: string;
  }
>(function PasswordInput(
  { id, placeholder, autoComplete = "current-password", invalid, onChange, value },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <div className="space-y-2">
      <AuthFieldLabel htmlFor={id}>Mot de passe</AuthFieldLabel>

      <div className="relative">
        <Lock
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/30"
        />

        <Input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
          data-auth-input
          aria-invalid={invalid}
          className="pr-12 pl-10"
          onChange={onChange}
          value={value}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-white/40 transition-colors duration-200 hover:text-white/75 focus-visible:ring-2 focus-visible:ring-[#F5B85B]/50 focus-visible:outline-none"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={visible ? "eye-off" : "eye"}
              initial={reducedMotion ? false : { opacity: 0, rotate: -35, scale: 0.85 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, rotate: 35, scale: 0.85 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="grid place-items-center"
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
});