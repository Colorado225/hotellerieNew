import { Waves } from "lucide-react";

/**
 * Marque de l'application (pages.md section 26).
 *
 * Le nom est passé en propriété plutôt que codé en dur, afin que le logo reste
 * remplaçable sans toucher aux appels — la spécification demande un composant
 * dédié précisément pour cela.
 */
export function AuthBrand({
  name = "LagoonKey",
  tagline,
}: {
  name?: string;
  tagline?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-[10px] bg-[#F5B85B] text-[#1a1206] shadow-[0_4px_18px_-6px_rgba(245,184,91,0.7)]">
        <Waves className="size-4.5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-white">{name}</span>
        {tagline ? (
          <span className="mt-1 text-[10px] tracking-[0.16em] text-white/40 uppercase">
            {tagline}
          </span>
        ) : null}
      </span>
    </div>
  );
}