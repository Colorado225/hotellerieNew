# LagoonKey — PMS hôtelier

**LagoonKey** est un PMS (property management system) destiné en priorité aux hôtels de Côte d'Ivoire : réservations, disponibilité, tarifs, séjour, folio, paiements, facturation, taxe communale de nuitée, certification FNE, housekeeping, night audit et reporting.

Construit sur [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) — Next.js 16 (App Router, React 19, React Compiler), TypeScript, Tailwind CSS v4, shadcn/ui. Le template n'est conservé que comme socle d'interface : toute la logique métier est écrite pour le PMS.

## Stack

| Couche | Choix |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui |
| Validation | Zod — schémas partagés entre formulaire et service métier |
| Base | PostgreSQL 17, ORM Prisma |
| Auth | Auth.js v5, sessions en base, mots de passe Argon2id |
| Sécurité | Row Level Security PostgreSQL, RBAC `resource.action`, CSP par environnement |
| Tests | Scripts de vérification exécutables sur base réelle |

## Architecture

Application unique en **modular monolith**, organisée par domaine métier :

```
src/
├── modules/
│   ├── auth/         Auth.js, Argon2, anti-bruteforce
│   ├── tenancy/      Contexte tenant dérivé de la session (jamais du client)
│   ├── permissions/  Catalogue des 26 permissions, RBAC
│   ├── availability/ Moteur de disponibilité
│   ├── rates/        Moteur tarifaire pur + service
│   ├── reservations/ Création transactionnelle des réservations
│   ├── property/     Schémas de validation des chambres et équipements
│   └── shared/       Erreurs métier typées
├── lib/              Singleton Prisma, client Auth.js
├── proxy.ts          En-têtes de sécurité et redirection de session
└── types/            Augmentations de types
```

### Principes non négociables

- **Argent** : tous les montants sont des `BigInt` (XOF). Jamais de `Float`.
- **Intégrité financière** : aucune transaction n'est supprimée. Une correction passe par un void autorisé, garanti par un trigger PostgreSQL.
- **Tenant** : le `propertyId` provient exclusivement de la session. Le RLS est la seconde barrière — une requête sans contexte ne voit aucune ligne.
- **Concurrence** : réservation et paiement s'exécutent en isolation `Serializable`. Une double réservation échoue par une erreur métier contrôlée.
- **Idempotence** : paiements et posting nocturne sont protégés par des index uniques partiels, garantis par la base.

## Démarrage

```bash
npm install
cp .env.example .env          # puis renseigner AUTH_SECRET
docker compose up -d          # Postgres, Redis, MinIO, Mailpit
npm run db:deploy             # applique les migrations
npm run db:seed               # établissement de démonstration
npm run dev
```

## Comptes de démonstration

Le seed crée cinq comptes du personnel, tous avec le mot de passe
`DemoIvoire2026!`. Ces identifiants n'existent que dans une base locale : le seed
refuse de s'exécuter en production.

| Email                | Rôle               | Portée                     |
| -------------------- | ------------------ | -------------------------- |
| `owner@demo.ci`      | Propriétaire       | Toute l'organisation       |
| `manager@demo.ci`    | Directeur général  | Établissement de démo      |
| `reception@demo.ci`  | Responsable réception | Établissement de démo   |
| `receptionist@demo.ci` | Réceptionniste    | Établissement de démo      |
| `cashier@demo.ci`    | Caissier           | Établissement de démo      |

## Configuration requise

`AUTH_SECRET` doit contenir une valeur non vide, sans quoi Auth.js refuse
toute requête d'authentification (`MissingSecret`) et la connexion échoue
silencieusement :

```bash
openssl rand -base64 32
```

## Vérifications

```bash
npm run typecheck                 # 0 erreur
npm run build                     # build de production
npm run db:verify                 # intégrité du schéma (6 contrôles)
npm run db:verify:tenancy         # isolation multi-tenant (3 scénarios)
npm run db:verify:rates           # moteur tarifaire (26 assertions)
npm run db:verify:double-booking  # concurrence sur la dernière chambre
```

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 1 | Schéma, migrations, RLS, CI | Terminé |
| 2 | Auth, tenancy, permissions | Terminé |
| 3 | Propriétés, chambres, tarifs | Terminé |
| 4 | Clients, disponibilité, réservations | Terminé |
| 5 | Séjour, check-in, folios, paiements | À venir |
| 6 | Facturation, taxes, FNE | À venir |
| 7 | Housekeeping, maintenance | À venir |
| 8 | Night audit, reporting | À venir |
| 9 | Sécurité, offline, performance | À venir |
| 10 | Tests exhaustifs, documentation | À venir |

Le cahier des charges complet est dans [`PROMPTMVP.md`](PROMPTMVP.md).

## Documentation d'origine du template
<img src="https://github.com/arhamkhnz/next-shadcn-admin-dashboard/blob/main/media/dashboard.png?version=5" alt="Dashboard Screenshot">

> [!NOTE]
> Looking for the Base UI version? Check out [next-shadcn-admin-dashboard-baseui](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui).
>
> Looking for the React Aria version? Check out [arhamkhnz/next-shadcn-admin-dashboard-aria](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-aria).
>
> Looking for the TanStack Start version? Check out [tanstack-shadcn-admin-dashboard](https://github.com/arhamkhnz/tanstack-shadcn-admin-dashboard).

## Features

- Built with Next.js 16, TypeScript, Tailwind CSS v4, and Shadcn UI  
- Responsive and mobile-friendly  
- Customizable theme presets (light/dark modes with color schemes like Tangerine, Brutalist, and more)  
- Flexible layouts (collapsible sidebar, variable content widths)  
- Authentication flows and screens  
- Prebuilt dashboards (Default, CRM, Finance, Analytics, Productivity) plus legacy variants  
- Role-Based Access Control (RBAC) with config-driven UI and multi-tenant support *(planned)*  

> [!NOTE]
> The default dashboard uses the **shadcn neutral** theme.  
> It also includes additional color presets inspired by [Tweakcn](https://tweakcn.com):  
>
> - Tangerine  
> - Neo Brutalism  
> - Soft Pop  
>
> You can create more presets by following the same structure as the existing ones.

> Looking for the **Next.js 15** version?  
> Check out the [`archive/next15`](https://github.com/arhamkhnz/next-shadcn-admin-dashboard/tree/archive/next15) branch.  
> This branch contains the setup prior to upgrading to Next 16 and the React Compiler.

> Looking for the **Next.js 14 + Tailwind CSS v3** version?  
> Check out the [`archive/next14-tailwindv3`](https://github.com/arhamkhnz/next-shadcn-admin-dashboard/tree/archive/next14-tailwindv3) branch.  
> It has a different color theme and is not actively maintained, but I try to keep it updated with major changes.  

## Tech Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4  
- **UI Components**: Shadcn UI  
- **Validation**: Zod  
- **Forms & State Management**: React Hook Form, Zustand  
- **Tables & Data Handling**: TanStack Table  
- **Tooling & DX**: Biome, Husky  

## Screens

### Available
- Default Dashboard  
- CRM Dashboard  
- Finance Dashboard  
- Analytics Dashboard  
- Productivity Dashboard  
- E-commerce Dashboard  
- Academy Dashboard  
- Logistics Dashboard  
- Infrastructure Dashboard  
- File Manager  
- Patient Monitoring  
- Chat Page  
- Email Page  
- Profile  
- Users Management  
- Roles Management  
- Kanban Board  
- Tasks Page  
- Invoice Page  
- Calendar Page  
- Authentication (4 screens)  
- Legacy: Default v1, CRM v1, Finance v1, Analytics v1

### Planned
I’ve added all the planned screens. Feel free to open an issue for requesting something specific.

## Colocation File System Architecture

This project follows a **colocation-based architecture** each feature keeps its own pages, components, and logic inside its route folder.  
Shared UI, hooks, and configuration live at the top level, making the codebase modular, scalable, and easier to maintain as the app grows.

For a full breakdown of the structure with examples, see the [Next Colocation Template](https://github.com/arhamkhnz/next-colocation-template).

## Getting Started

You can run this project locally, or deploy it instantly with Vercel.

### Deploy with Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Farhamkhnz%2Fnext-shadcn-admin-dashboard)

_Deploy your own copy with one click._

### Run locally

1. **Clone the repository**
   ```bash
   git clone <votre-depot-lagoonkey>.git
   ```
   
2. **Navigate into the project**
   ```bash
    cd next-shadcn-admin-dashboard
   ```
   
3. **Install dependencies**
   ```bash
    npm install
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

Your app will be running at [http://localhost:3000](http://localhost:3000)

### Formatting and Linting

Format, lint, and organize imports
```bash
npx @biomejs/biome check --write
```
> For more information on available rules, fixes, and CLI options, refer to the [Biome documentation](https://biomejs.dev/).

---

> [!IMPORTANT]  
> This project is updated frequently. If you’re working from a fork or an older clone, pull the latest changes before syncing. Some updates may include breaking changes.

---

Contributions are welcome. Feel free to open issues, feature requests, or start a discussion.


**Happy Vibe Coding!**
