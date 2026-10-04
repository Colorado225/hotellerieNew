/**
 * Visuel de la colonne latérale des écrans d'authentification.
 *
 * Les maquettes de référence utilisent des photographies d'immeubles. Le
 * projet ne peut pas embarquer ces images : elles appartiennent au template
 * d'origine et rien n'a été versé dans `public/`. Ce composant fournit donc un
 * fond abstrait, purement décoratif, qui reprend la composition de la
 * maquette — grand visuel arrondi à droite, texte en surimpression — sans
 * introduire d'actif tiers.
 *
 * Le visuel est masqué aux lecteurs d'écran et aux appareils sans image : il
 * ne porte aucune information.
 */
export function AuthShowcase({
  quote,
  variant = "panel",
}: {
  /** Accroche affichée en surimpression du visuel. */
  quote: string;
  /**
   * `panel` : visuel arrondi à droite, comme sur l'écran de connexion.
   * `full` : fond pleine page, comme sur l'écran d'inscription.
   */
  variant?: "panel" | "full";
}) {
  return (
    <div
      aria-hidden="true"
      className={
        variant === "panel"
          ? "relative order-2 hidden overflow-hidden rounded-3xl bg-primary lg:flex"
          : "pointer-events-none absolute inset-0 overflow-hidden bg-primary"
      }
    >
      {/* Dégradé de fond : rappelle la photographie d'immeubles sans en
          reproduire aucune. */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "linear-gradient(160deg, #1e3a5f 0%, #0f2740 45%, #071a2e 100%), radial-gradient(circle at 70% 25%, rgba(255,255,255,0.14), transparent 55%)",
        }}
      />

      {/* Trame régulière évoquant une façade, sans image externe. */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground">
        {variant === "panel" && <AuthWordmark />}

        <blockquote className="max-w-sm text-balance text-xl leading-snug font-medium">
          {quote}
        </blockquote>

        {variant === "panel" && (
          <dl className="grid grid-cols-3 gap-6 border-t border-primary-foreground/20 pt-6">
            <div>
              <dt className="text-xs opacity-70">Établissements</dt>
              <dd className="text-lg font-medium">Multi-tenant</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Devise</dt>
              <dd className="text-lg font-medium">XOF</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Montants</dt>
              <dd className="text-lg font-medium">Entiers exacts</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

/** Marque LagoonKey, utilisée en en-tête du visuel. */
function AuthWordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground/15 text-base font-semibold">
        LK
      </span>
      <span className="text-lg font-medium">LagoonKey</span>
    </div>
  );
}