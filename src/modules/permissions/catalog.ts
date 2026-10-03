/**
 * Catalogue des permissions (PROMPTMVP.md section 41).
 *
 * Ce fichier est la source de vérité applicative. Les mêmes couples
 * « resource.action » sont insérés en base par le seed. Aucune autorisation
 * ne doit être exprimée par comparaison à un libellé de rôle
 * (`if (role === "admin")`) : on vérifie toujours une permission.
 */

/** Regroupements fonctionnels, utilisés pour le rendu des écrans de rôles. */
export const PERMISSION_GROUPS = {
  reservation: [
    "reservation.create",
    "reservation.update",
    "reservation.cancel",
    "reservation.override_price",
    "reservation.no_show",
  ],
  stay: ["stay.check_in", "stay.check_out", "stay.change_room"],
  folio: ["folio.view", "folio.post_charge", "folio.adjust", "folio.void"],
  payment: ["payment.create", "payment.refund"],
  invoice: ["invoice.create", "invoice.finalize", "invoice.cancel"],
  fne: ["fne.submit", "fne.retry"],
  housekeeping: ["housekeeping.assign", "housekeeping.complete"],
  night_audit: ["night_audit.run", "night_audit.close"],
  administration: ["reports.view", "settings.manage", "users.manage"],
} as const satisfies Record<string, readonly string[]>;

export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

/** Liste à plat de toutes les permissions déclarées par le PMS. */
export const ALL_PERMISSIONS: string[] = Object.values(PERMISSION_GROUPS).flat();

/**
 * Permissions critiques : leur exercice est journalisé en plus de l'audit
 * standard (section 42). Un remboursement ou une clôture de caisse doivent
 * laisser une trace nominative.
 */
export const SENSITIVE_PERMISSIONS: ReadonlySet<string> = new Set([
  "reservation.override_price",
  "folio.void",
  "payment.refund",
  "invoice.finalize",
  "invoice.cancel",
  "fne.submit",
  "night_audit.close",
]);

/**
 * Matrice des rôles système (section 40).
 *
 * OWNER et SUPER_ADMIN reçoivent toutes les permissions. Les autres rôles
 * sont énumérés explicitement : une permission ajoutée au PMS ne doit pas
 * être accordée par défaut à un rôle existant.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  OWNER: ALL_PERMISSIONS,
  GENERAL_MANAGER: ALL_PERMISSIONS,
  FRONT_DESK_MANAGER: [
    ...PERMISSION_GROUPS.reservation,
    ...PERMISSION_GROUPS.stay,
    ...PERMISSION_GROUPS.folio,
    ...PERMISSION_GROUPS.payment,
    ...PERMISSION_GROUPS.invoice,
    "folio.view",
    "housekeeping.assign",
    "reports.view",
  ],
  RECEPTIONIST: [
    "reservation.create",
    "reservation.update",
    "reservation.cancel",
    "reservation.no_show",
    "stay.check_in",
    "stay.check_out",
    "stay.change_room",
    "folio.view",
    "folio.post_charge",
    "payment.create",
  ],
  CASHIER: ["folio.view", "payment.create", "payment.refund", "invoice.create", "reports.view"],
  HOUSEKEEPING_SUPERVISOR: [
    "housekeeping.assign",
    "housekeeping.complete",
    "folio.view",
    "reports.view",
  ],
  HOUSEKEEPER: ["housekeeping.complete", "folio.view"],
  MAINTENANCE: ["housekeeping.complete", "folio.view"],
  ACCOUNTANT: [
    "folio.view",
    "folio.adjust",
    "payment.create",
    "payment.refund",
    "invoice.create",
    "invoice.finalize",
    "invoice.cancel",
    "fne.submit",
    "fne.retry",
    "night_audit.run",
    "reports.view",
  ],
  AUDITOR: [
    "folio.view",
    "invoice.create",
    "reports.view",
    "night_audit.run",
    "night_audit.close",
  ],
};

/**
 * Regroupe les permissions par ressource pour éviter de charger un
 * Namespaced group à chaque vérification.
 */
export const PERMISSIONS_BY_RESOURCE: Readonly<Record<string, ReadonlySet<string>>> =
  Object.fromEntries(
    Object.entries(PERMISSION_GROUPS).map(([resource, permissions]) => [
      resource,
      new Set(permissions),
    ]),
  );

/** Vérifie qu'une chaîne a la forme « resource.action ». */
export function isPermission(value: string): boolean {
  const separator = value.indexOf(".");
  return separator > 0 && separator < value.length - 1;
}

/** Extrait la ressource d'une permission (« folio.void » -> « folio »). */
export function permissionResource(value: string): string {
  return value.slice(0, value.indexOf("."));
}