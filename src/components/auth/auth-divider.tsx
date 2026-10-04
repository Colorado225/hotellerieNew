/**
 * Séparateur « OU » (pages.md section 11).
 *
 * Le trait est produit par les pseudo-éléments définis dans la feuille de style :
 * un dégradé transparent au centre, pour que le trait se fonde dans le fond au
 * lieu de s'interrompre.
 */
export function AuthDivider({ label = "OU" }: { label?: string }) {
  return (
    <div data-auth-divider className="flex items-center gap-4" role="separator">
      <span aria-hidden="true" className="text-[11px] font-medium tracking-[0.16em] text-white/35 uppercase">
        {label}
      </span>
    </div>
  );
}