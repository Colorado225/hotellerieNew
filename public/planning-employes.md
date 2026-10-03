# Plan technique — Employés et planning des équipes

Statut : **à valider. Aucun code écrit.** Ce document précède la migration
`008_...` et les écrans qui en dépendent.

Source de vérité du modèle : PostgreSQL via `supabase/migrations`. Ce document ne
crée pas une seconde définition : il décrit ce que les migrations devront créer.

## 1. Pourquoi une migration et pas un écran

Il n'existe aujourd'hui **aucune notion d'employé** dans le schéma. Les 15 tables
sont `tenants`, `tenant_memberships`, `hotels`, `room_types`, `rooms`, `guests`,
`reservations`, `folio_lines`, `housekeeping_tasks`, `cash_sessions`,
`maintenance_tickets`, `audit_logs`, `plans`, `subscriptions`,
`subscription_events`.

Un planning d'équipe sans équipe n'est qu'un tableau : il faut donc **deux tables
nouvelles**, leurs politiques RLS, et les RPC qui portent les règles — comme le
reste du projet, où l'écriture métier passe par des fonctions
`SECURITY DEFINER` (`create_reservation`, migration 005) et non par des
`insert` directs depuis le navigateur.

## 2. Périmètre proposé

Deux tables, délibérément minimales pour un MVP :

| Table | Rôle |
|---|---|
| `staff` | La personne : identité, rôle, contrat, taux horaire. |
| `shifts` | Le planning : une affectation d'une personne sur un créneau daté. |

Le planning n'est **pas** porté par une colonne `shift` sur `staff` : unplanning
est une collection de lignes datées. C'est la même raison qui fait que
`housekeeping_tasks` est une table à part.

## 3. Table `staff`

```sql
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  hotel_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  role text NOT NULL,
  phone text,
  email text,
  contract_type text NOT NULL DEFAULT 'full_time',
  hired_on date,
  -- XOF en entier, jamais en flottant (cf. docs/data-model.md § Montants).
  hourly_rate_minor bigint NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_role_check
    CHECK (role IN ('director','manager','receptionist','housekeeper',
                    'maintenance','accountant','night_audit','porter')),

  CONSTRAINT staff_contract_check
    CHECK (contract_type IN ('full_time','part_time','seasonal','casual')),

  CONSTRAINT staff_rate_check CHECK (hourly_rate_minor >= 0),

  CONSTRAINT staff_tenant_hotel_fkey
    FOREIGN KEY (tenant_id, hotel_id)
    REFERENCES public.hotels (tenant_id, id) ON DELETE RESTRICT,

  -- Requis par la FK composite de `shifts` vers `staff`. Meme mecanisme que
  -- `hotels_tenant_id_id_key` (migration 003) : sans cette contrainte, le
  -- `CREATE TABLE shifts` echoue et la migration entiere est rejetee.
  CONSTRAINT staff_tenant_id_key UNIQUE (tenant_id, id)
);

-- Un compte de connexion ne peut être rattaché qu'à une fiche par hôtel.
CREATE UNIQUE INDEX staff_user_hotel_uniq
  ON public.staff (tenant_id, hotel_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX staff_tenant_hotel_idx ON public.staff (tenant_id, hotel_id);
```

Trois points de conception :

1. **`user_id` est nullable.** Une femme de chambre n'a pas forcément de compte.
   La fiche doit exister avant l'accès, et l'accès doit pouvoir s'activer plus
   tard. L'index unique partiel (`WHERE user_id IS NOT NULL`) empêche qu'un
   même compte soit employé dans deux hôtels du même tenant sans interdire les
   fiches sans compte.
2. **`role` est une donnée d'autorisation serveur**, au même titre que les rôles
   de `tenant_memberships`. Le client ne la choisit pas librement : elle est
   bornée par une `CHECK`, et c'est le RPC qui l'attribue. Un `readonly` ne doit
   pas pouvoir se nommer `director`.
3. **Pas de suppression physique.** `docs/data-model.md` impose `deleted_at` en
   preference de `DELETE` pour les donnees de gestion ; ici `active boolean`
   suffit au MVP et évite d'ajouter une colonne que rien ne consume. **À
   arbitrer** : si l'historique des planning doit survivre à un départ, il faudra
## 4. Table `shifts`

```sql
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  hotel_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes int NOT NULL DEFAULT 0,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  -- Idempotence hors-ligne, meme mecanique que housekeeping_tasks (migration 005).
  client_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Horodatages « muraux » derives. Volontairement NAIFS (sans fuseau) : un
  -- hotel a une seule heure locale, Africa/Abidjan par defaut. Stocker de
  -- l'UTC obligerait le navigateur a convertir, et une saisie faite a 23h
  -- pres d'un changement d'heure decalerait le service d'une heure.
  starts_at timestamp NOT NULL GENERATED ALWAYS AS (shift_date + start_time) STORED,
  ends_at timestamp NOT NULL GENERATED ALWAYS AS (
    shift_date + end_time
      + CASE WHEN end_time <= start_time THEN interval '1 day' ELSE interval '0 days' END
  ) STORED,

  CONSTRAINT shifts_break_check CHECK (break_minutes BETWEEN 0 AND 720),
  CONSTRAINT shifts_status_check
    CHECK (status IN ('planned','confirmed','worked','absent','cancelled')),

  CONSTRAINT shifts_staff_tenant_fkey
    FOREIGN KEY (tenant_id, staff_id)
    REFERENCES public.staff (tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT shifts_tenant_hotel_fkey
    FOREIGN KEY (tenant_id, hotel_id)
    REFERENCES public.hotels (tenant_id, id) ON DELETE RESTRICT
);

-- Une personne ne peut pas etre planifiee deux fois au meme moment.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    staff_id WITH =,
    tsrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');

CREATE INDEX shifts_day_idx ON public.shifts (tenant_id, hotel_id, shift_date);

CREATE UNIQUE INDEX shifts_client_ref_uniq
  ON public.shifts (client_ref) WHERE client_ref IS NOT NULL;
```

### 4.1 Le service de nuit

`end_time <= start_time` signifie que le service franchit minuit. La colonne
`ends_at` ajoute alors un jour. Un service de 20h00 a 08h00 occupe donc bien la
nuit **et** le matin du lendemain, ce qui est le fonctionnement reel d'un hotel —
et c'est exactement le cas qu'un `CHECK (end_time > start_time)` aurait rendu
impossible a saisir.
### 4.2 Pourquoi une contrainte d'exclusion

Le double booking est le risque principal d'un planning : deux responsables
planifient le meme employe au meme moment, en se fiant chacun a son ecran. Une
verification applicative perd la course (lecture-ecriture non atomique). La
contrainte `EXCLUDE USING gist` est arbitree par PostgreSQL : le second `INSERT`
echoue, quel que soit le nombre d'onglets ouverts. C'est le meme choix que la
contrainte de sur-reservation deja en place sur les reservations (migration 004,
`docs/data-model.md` § 6).

Le `WHERE (status <> 'cancelled')` est indispensable : une annulation doit
liberer le creneau, sinon impossible de reprogrammer quelqu'un.

### 4.3 Statut `absent` et heures effectivement faites

`status` distingue le **planning** de la **realite**. `planned`/`confirmed` sont
ce qui est prevu ; `worked` est ce qui a ete fait. Aucun `hours_worked` n'est
**prevu** a ce stade : sans pointage ni badgeuse, ce champ serait saisi a la main
et deviendrait une source de desaccord. **A arbitrer** : si le suivi du temps de
travail devient un besoin (paie, heures supplementaires), il faudra une table
`time_entries` separee et append-only, et non une colonne modifiable.
## 5. Politiques RLS

Reprise stricte du modele en place : helper `SECURITY DEFINER`, `search_path`
fixe a `''`, role issu de `auth.uid()` via `tenant_memberships`.

| Operation | `staff` | `shifts` |
|---|---|---|
| `SELECT` | tout membre du tenant | tout membre du tenant **+ l'employe lui-meme** |
| `INSERT` | `owner, admin, manager` | `owner, admin, manager, receptionist` |
| `UPDATE` | `owner, admin, manager` | `owner, admin, manager, receptionist` |
| `DELETE` | `owner, admin` | `owner, admin` |

La ligne « l'employe lui-meme » n'est pas un detail : un hotel sert une
planification visible de tous, mais seul l'interesse doit pouvoir consulter la
sienne sans voir les horaires de ses collegues. Il faut donc un second helper, car
interroger `staff` depuis une policy sur `shifts` declencherait la policy de
`staff` et le rendrait recursif, donc inutilisable tel quel.

```sql
CREATE OR REPLACE FUNCTION private.is_own_staff(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id
      AND s.user_id = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION private.is_own_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_own_staff(uuid) TO authenticated;
```

```sql
CREATE POLICY shifts_select ON public.shifts
  FOR SELECT TO authenticated
  USING (
    private.has_tenant_role(tenant_id)
    OR private.is_own_staff(staff_id)
  );

CREATE POLICY staff_select ON public.staff
  FOR SELECT TO authenticated
  USING (private.has_tenant_role(tenant_id) OR user_id = (SELECT auth.uid()));
```

Aucune policy n'est definie pour `anon` : les tables restent inaccessibles sans
JWT, conformement au reste du schema.

## 6. RPC et regles metier

L'ecriture ne se fait pas en `insert` direct depuis le navigateur, comme pour
`create_reservation` (migration 005).

**`public.assign_shift(...)`** — arguments : tenant, hotel, employe, date,
debut, fin, pause, role, notes, `client_ref`. La fonction :

1. verifie que la fiche est `active` et que la date n'est pas anterieure a
   aujourd'hui ;
## 7. Tests

Fichier `supabase/tests/staff_shifts.test.sql`, en pgTAP comme les trois
existants. Les cas qui doivent **casser** sont plus importants que ceux qui
doivent passer :

1. `staff_id` appartenant a un autre tenant -> `throws_ok` sur l'insertion.
2. Deux services qui se chevauchent pour la meme personne -> rejet.
3. Deux services jointifs (14h-22h puis 22h-06h) -> **acceptes**, la borne est
   semi-ouverte.
4. Un service `cancelled` n'empeche pas d'en planifier un autre sur le meme
   creneau.
5. Un `receptionist` tente d'insérer un planning pour autrui -> `throws_ok`.
6. Un employe lit le planning d'un collegue -> `throws_ok` ; lit le sien -> OK.
7. Un service de nuit (`20:00` -> `08:00`) est accepte, et `ends_at` vaut bien le
   lendemain.
8. Deux appels avec le meme `client_ref` -> une seule ligne.

Les points 2, 3 et 4 sont ceux qui cassent en production. Les points 5 et 6
valident que la securite n'est pas seulement declaree mais effective.

## 8. Ecran

**`src/pages/StaffPage.tsx`** — CRUD des fiches : nom / role / contrat / taux /
actif. Aucun `DELETE` dans l'interface : on desactive.

**`src/pages/StaffPlanningPage.tsx`** — planning de la semaine, une ligne par
employe et une colonne par jour, avec le creneau. Le calendrier deja livre cette
semaine est reutilise tel quel : `Calendar` de `@/components/ui/calendar` avec un
`DayButton` affichant le nombre d'employes planifies, sur le modele de
`RoomOccupancyCalendar`.

La couche de rendu du calendrier est donc **deja prete** : l'ecran employes ne
demandera aucun travail sur `react-day-picker`.

## 9. Decoupage

| Etape | Contenu | Portee |
|---|---|---|
| 1 | Migration `008` : tables, index, exclusion, RLS, helpers | SQL |
| 2 | Migration `009` : RPC, audit, idempotence `client_ref` | SQL |
| 3 | `staff_shifts.test.sql` | pgTAP |
| 4 | Types dans `src/lib/supabase.ts`, `StaffPage` | Front |
| 5 | `StaffPlanningPage`, calendrier de couverture | Front |
| 6 | Rattachement des comptes (`user_id`), sur invitation | A specify |

Les etapes 1 et 2 sont ecrites ensemble dans la meme session : les policies
RLS d'etape 1 referencent les helpers, et les RPC d'etape 2 sont ce qui les
exerce reellement. Les livrer separement laisserait entre les deux un etat
intermediaire non teste.

## 10. Questions a trancher avant l'etape 1

1. **Granularite.** Planning en creneaux (07h-15h) ou en journees de presence ?
   Les creneaux permettent le calcul d'heures mais sont bien plus laborieux a
   saisir au telephone. Le plan ci-dessus suppose les **creneaux**.
2. **Repos legal.** Faut-il interdire deux services separes de moins de 11 h, ou
   plafonner a 48 h par semaine ? C'est une regle metier : elle appartient dans
   un trigger, pas dans l'ecran. Non traite ci-dessus.
3. **Employe multi-hotels.** Le modele est un employe par hotel. Un directeur de
   groupe supervise plusieurs hotels : faut-il une table `staff_assignments` ?
4. **Cout du travail.** `hourly_rate_minor` est stocke mais jamais utilise.
   Faut-il le brancher sur la cloture de caisse, ou l'ignorer au MVP ?
5. **Liaison housekeeping.** Faut-il qu'un depart de client genere
   automatiquement une tache menage affectee a l'equipe du jour ? Aujourd'hui
   `housekeeping_tasks.assigned_to` est un `text` libre : le relier a `staff`
   serait un upgrade net, mais sort du perimetre de ce plan.
2. laisse la contrainte d'exclusion arbitrer le conflit ;
3. ecrit la ligne `audit_logs` (`action = 'shift.assign'`,
   `entity_type = 'shifts'`) **dans la meme transaction** ;
4. est `SECURITY DEFINER`, `SET search_path = ''`, et ne fait confiance qu'aux
   arguments plus `auth.uid()`.

**`public.set_shift_status(p_shift_id, p_status)`** — passage a `worked` ou
`absent`, avec audit.

**`public.set_staff_active(p_staff_id, p_active)`** — desactivation. **Refuse**
si la personne a des `shifts` non annules a venir : sans cette garde, on
desactive quelqu'un et son planning de la semaine reste affiche comme si de rien
n'etait.

Le `client_ref` et son index unique rendent l'operation **idempotente** : un
rejeu apres reconnexion hors-ligne ne cree pas de doublon. C'est le mecanisme
deja utilise pour `housekeeping_tasks`.
   `deleted_at` et ne plus compter sur `active`.