"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "cn";

import { Label } from "@/components/ui/label";

/** Critères de robustesse (pages.md section 29). */
const RULES = [
  { id: "length", label: "12 caractères minimum", test: (value: string) => value.length >= 12 },
  { id: "lowercase", label: "une minuscule", test: (value: string) => /[a-z]/.test(value) },
  { id: "uppercase", label: "une majuscule", test: (value: string) => /[A-Z]/.test(value) },
  { id: "number", label: "un chiffre", test: (value: string) => /\d/.test(value) },
  { id: "special", label: "un caractère spécial", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export type StrengthLevel = "weak" | "fair" | "good" | "strong";

const LABELS: Record<StrengthLevel, string> = {
  weak: "Faible",
  fair: "Moyen",
  good: "Bon",
  strong: "Solide",
};

/**
 * Barre de robustesse du mot de passe (pages.md section 29).
 *
 * Le niveau est dérivé du nombre de critères satisfaits, et non d'un score de
 * pondération : la mesure doit être explicable à l'utilisateur, or chaque
 * critère affiché correspond exactement à une coche de la barre.
 *
 * L'exigence de longueur est portée à 12 caractères plutôt que les 8 suggérés en
 * section 28 : ce mot de passe protège les données d'identité et de paiement des
 * clients. La contrainte est affichée, donc elle n'est pas cachée.
 */
export function PasswordStrength({ value }: { value: string }) {
  const reducedMotion = useReducedMotion();

  const satisfied = RULES.filter((rule) => rule.test(value));
  const score = satisfied.length;

  const level: StrengthLevel =
    score <= 2 ? "weak" : score === 3 ? "fair" : score === 4 ? "good" : "strong";

  // Un mot de passe vide ne doit pas afficher « faible » : ce serait une
  // alerte sur un champ encore vierge.
  const visible = value.length > 0;
  const ratio = visible ? score / RULES.length : 0;

  const colors: Record<StrengthLevel, string> = {
    weak: "#f87171",
    fair: "#f5a85b",
    good: "#f5c47b",
    strong: "#f5b85b",
  };

  return (
    <div className="space-y-2" aria-live="polite">
      <div data-auth-strength-track className="w-full">
        {/* Remplissage par `scaleX` et non `width` : la section 21 interdit
            d'animer les propriétés de disposition, qui déclenchent un recalcul
            de mise en page à chaque image. La piste est dimensionnée au maximum
            et l'échelle fait le remplissage. */}
        <motion.div
          className="h-full w-full origin-left rounded-full"
          style={{ background: visible ? colors[level] : "transparent" }}
          initial={false}
          animate={{ scaleX: visible ? ratio : 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {visible && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium tracking-wide" style={{ color: colors[level] }}>
            {LABELS[level]}
          </p>
          {/* La liste des critères rendus visibles évite que l'utilisateur
              n'ait à deviner ce qui manque. */}
          <ul className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            {RULES.map((rule) => {
              const ok = rule.test(value);

              return (
                <li
                  key={rule.id}
                  className="flex items-center gap-1 text-[10px] transition-colors duration-200"
                  style={{ color: ok ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)" }}
                >
                  <motion.span
                    className="grid size-3 place-items-center rounded-full text-[8px] leading-none"
                    style={{ background: ok ? "rgba(245,184,91,0.18)" : "rgba(255,255,255,0.06)" }}
                    initial={false}
                    animate={{ scale: ok ? 1 : 0.85, opacity: ok ? 1 : 0.6 }}
                    transition={{ duration: 0.2 }}
                    aria-hidden="true"
                  >
                    ✓
                  </motion.span>
                  <span className="sr-only">
                    {rule.label} : {ok ? "satisfait" : "non satisfait"}
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    {rule.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Étiquette réutilisée par les deux formulaires. */
export function AuthFieldLabel({
  htmlFor,
  children,
  className,
}: {
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className={cn(
        "text-[13px] font-medium text-white/70 transition-colors peer-focus:text-white/90",
        className,
      )}
    >
      {children}
    </Label>
  );
}