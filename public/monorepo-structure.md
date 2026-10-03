# Structure proposée du projet Supabase

Version de cadrage : 0.2  
La structure conserve le dépôt Vite/React existant et ajoute progressivement les migrations, RPC, Edge Functions et tests Supabase. Ce n’est pas un monorepo pnpm.

```text
hotel-gest/
├── src/                              # Application Vite/React existante
│   ├── components/                   # AppShell, Badge, Modal, composants UI
│   ├── context/                      # Contexte d’authentification et hôtel actif
│   ├── lib/                          # Client supabase-js, formatage
│   ├── pages/                        # Écrans PMS existants
│   └── features/                     # À créer progressivement par domaine
├── supabase/
│   ├── migrations/                   # Source unique du schéma SQL, RLS, RPC
│   ├── functions/                    # Edge Functions pour secrets et webhooks
│   │   ├── payment-webhook/
│   │   └── notifications/            # À ajouter lorsque le canal sera choisi
│   ├── tests/                        # Tests SQL/RLS et fonctions
│   └── config.toml                   # Configuration Supabase CLI, si nécessaire
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── domain-events.md
│   ├── workflows.md
│   └── monorepo-structure.md
├── e2e/                              # Playwright, après stabilisation des flux
├── .github/workflows/                # CI migrations, tests et build
├── .env.example                      # Noms de variables uniquement
├── package.json
├── package-lock.json
└── vite.config.ts
```

## Règles d’accès et de dépendance

- `src/lib/supabase.ts` expose uniquement le client public `anon`; les droits proviennent de l’utilisateur connecté et des policies RLS.
- Les lectures et mutations ordinaires utilisent `supabase-js` avec les policies testées. Les mutations qui exigent plusieurs écritures atomiques passent par une RPC SQL dédiée.
- Les Edge Functions détiennent les secrets de prestataires, vérifient les JWT et appellent des fonctions SQL autorisées. Aucune clé `service_role` ne va dans `VITE_*`.
- `supabase/migrations` est l’unique source versionnée du schéma. Les types TypeScript sont générés à partir de Supabase ; aucun fichier Prisma parallèle n’est maintenu.
- Les règles métier pures peuvent être extraites dans `src/features/<domain>` si elles sont réutilisées ; ne pas créer des packages génériques avant un besoin réel.

## Choix d’outillage

Le dépôt conserve npm et son `package-lock.json`. La Supabase CLI démarre les services locaux et applique les migrations. Pas de pnpm workspaces, Turborepo, Docker Compose PostgreSQL/Redis ou serveur NestJS pour le MVP. Le choix de CI/CD et d’hébergement intervient après le pilote, sans présumer d’un cloud ou d’une résidence de données non validés.
