import {
  BedDouble,
  CalendarCheck,
  CalendarRange,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Moon,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

/**
 * Navigation du PMS.
 *
 * L'arborescence suit la section 60 du cahier des charges. Les écrans qui
 * n'existent pas encore sont déclarés `disabled` : le §142 interdit de
 * présenter comme disponible une fonctionnalité non terminée, et la
 * section 2 interdit le toast « Coming soon ». Un écran en construction est
 * donc visible mais non cliquable, ce qui donne une feuille de route au
 * personnel sans annoncer du faux.
 */
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Exploitation",
    items: [
      {
        id: "front-desk",
        title: "Réception",
        url: "/dashboard/front-desk",
        icon: LayoutDashboard,
      },
      {
        id: "reservations",
        title: "Réservations",
        url: "/dashboard/reservations",
        icon: CalendarRange,
      },
      {
        id: "guests",
        title: "Clients",
        url: "/dashboard/guests",
        icon: Users,
      },
      {
        id: "room-plan",
        title: "Planning des chambres",
        url: "/dashboard/room-plan",
        icon: BedDouble,
        disabled: true,
      },
      {
        id: "housekeeping",
        title: "Housekeeping",
        url: "/dashboard/housekeeping",
        icon: Sparkles,
        disabled: true,
      },
    ],
  },
  {
    id: 2,
    label: "Finance",
    items: [
      {
        id: "folios",
        title: "Folios",
        url: "/dashboard/folios",
        icon: Receipt,
        disabled: true,
      },
      {
        id: "payments",
        title: "Paiements",
        url: "/dashboard/payments",
        icon: Receipt,
        disabled: true,
      },
      {
        id: "cashier",
        title: "Caisse",
        url: "/dashboard/cashier",
        icon: FileText,
        disabled: true,
      },
      {
        id: "invoices",
        title: "Factures",
        url: "/dashboard/invoices",
        icon: FileText,
        disabled: true,
      },
      {
        id: "taxes",
        title: "Taxes et FNE",
        url: "/dashboard/taxes",
        icon: FileText,
        disabled: true,
      },
      {
        id: "reports",
        title: "Rapports",
        url: "/dashboard/reports",
        icon: CalendarCheck,
        disabled: true,
      },
    ],
  },
  {
    id: 3,
    label: "Exploitation technique",
    items: [
      {
        id: "maintenance",
        title: "Maintenance",
        url: "/dashboard/maintenance",
        icon: Wrench,
        disabled: true,
      },
      {
        id: "night-audit",
        title: "Night audit",
        url: "/dashboard/night-audit",
        icon: Moon,
        disabled: true,
      },
    ],
  },
  {
    id: 4,
    label: "Administration",
    items: [
      {
        id: "users",
        title: "Utilisateurs",
        url: "/dashboard/users",
        icon: Users,
        disabled: true,
      },
      {
        id: "roles",
        title: "Rôles et permissions",
        url: "/dashboard/roles",
        icon: ShieldCheck,
        disabled: true,
      },
      {
        id: "settings",
        title: "Paramètres",
        url: "/dashboard/settings",
        icon: Settings,
        disabled: true,
      },
      {
        id: "audit",
        title: "Journal d'audit",
        url: "/dashboard/audit",
        icon: FileText,
        disabled: true,
      },
    ],
  },
];