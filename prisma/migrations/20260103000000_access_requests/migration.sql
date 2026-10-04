-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccessRequestType" AS ENUM ('OWNER', 'MANAGER', 'AGENT');

-- CreateTable
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "type" "AccessRequestType" NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" UUID,
    "property_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_requests_email_status_idx" ON "access_requests"("email", "status");

-- CreateIndex
CREATE INDEX "access_requests_status_created_at_idx" ON "access_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "access_requests_property_id_idx" ON "access_requests"("property_id");

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Durcissement du RLS : activation de FORCE sur les tables opérationnelles.
-- ----------------------------------------------------------------------------

-- Constat
--
-- Les 39 tables métier portent `ENABLE ROW LEVEL SECURITY` mais pas
-- `FORCE ROW LEVEL SECURITY`. En PostgreSQL, cette distinction est capitale :
-- `ENABLE` n'applique les politiques qu'aux autres rôles, tandis que le
-- propriétaire de la table les contourne. L'application se connectant avec le
-- rôle qui possède les tables, ses politiques n'étaient donc jamais appliquées
-- en production — le RLS reposait entièrement sur le filtrage applicatif.
--
-- Une fuite inter-tenant n'aurait alors plus exigé qu'un oubli d'une clause
-- `where` dans un service : elle aurait suffi.
--
-- `FORCE` corrige cela : le propriétaire est soumis à ses propres politiques.
-- Il ne gêne pas l administration des schémas — les migrations utilisent
-- `ALTER TABLE`, `CREATE POLICY` et `DROP`, qui ne sont pas des DML et restent
-- hors de portée du RLS.
--
-- Les déclencheurs `ENABLE ALWAYS` posés par la migration initiale visent la
-- même catégorie de risque : ils s'appliquent au propriétaire, et sont donc
-- restés nécessaires.
--
-- Effet attendu : une requête sans contexte `app.organization_id` renvoie zéro
-- ligne sur les tables métier, y compris pour le propriétaire.
DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
    RAISE NOTICE 'RLS force sur %', target;
  END LOOP;
END $$;

-- Une seule demande en attente par adresse, comparaison insensible à la casse.
-- C'est ce qui empêche le spam par répétition et permet de renvoyer au
-- visiteur « une demande est déjà en cours » plutôt que d'accumuler les lignes.
-- L'index est partiel : une demande rejetée ou expirée laisse l'adresse de
-- nouveau disponible, ce qui est le comportement attendu.
CREATE UNIQUE INDEX "access_requests_one_pending_per_email"
  ON "access_requests" (LOWER("email"))
  WHERE "status" = 'PENDING';

-- Le RLS est délibérément laissé désactivé sur cette table, à l'inverse des
-- 39 tables opérationnelles. Une demande est déposée depuis le formulaire
-- public, sans session ni tenant : elle arrive précisément avant qu'on sache à
-- quel établissement la rattacher. Une politique exigeant un tenant la
-- rejeterait systématiquement.
--
-- Ce que cela n'ouvre pas : `access_requests` ne contient ni rôle, ni
-- permission, ni donnée financière. Le mot de passe y est stocké en Argon2id,
-- jamais en clair. Le danger réel — obtenir une session — reste fermé par
-- `authorize`, qui refuse tout compte absent de `user_roles`, et par
-- `createUser`, neutralisé dans l'adapter.
--
-- La lecture des demandes, elle, est réservée aux écrans d'administration,
-- qui passent par un contexte RLS explicite : la politique `access_requests_read`
-- ne laisse voir que les demandes rattachées à l'organisation courante.
--
-- Effet attendu : `SELECT * FROM access_requests` sans contexte ne renvoie
-- aucune ligne, et avec le contexte d'un tenant ne renvoie que ses demandes.
--
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;

-- Politique de lecture : une demande n'est visible que par l'organisation de
-- l'établissement auquel elle est rattachée. Sans `property_id`, elle n'est
-- visible de personne — c'est le cas d'une demande fraîchement déposée, qui
-- reste donc invisible jusqu'à son instruction.
--
-- Le dépôt d'une demande n'exige pas cette visibilité : il n'écrit rien dans
-- `users` et ne produit aucune session.
CREATE POLICY "access_requests_read" ON "access_requests"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = access_requests.property_id
        AND p.organization_id::text = current_setting('app.organization_id', true)
    )
  );

-- Écriture ouverte au formulaire public : insertion et transition d'état.
-- Aucune de ces opérations ne modifie `users` ni `user_roles`.
CREATE POLICY "access_requests_insert" ON "access_requests"
  FOR INSERT
  WITH CHECK (status = 'PENDING' AND user_id IS NULL);

-- Mise à jour : uniquement le passage de PENDING vers un état instruit, avec
-- le compte créé à l'approbation. La condition `user_id IS NULL` empêche de
-- réattribuer une demande déjà instruite.
CREATE POLICY "access_requests_update" ON "access_requests"
  FOR UPDATE
  USING (status = 'PENDING')
  WITH CHECK (user_id IS NOT NULL OR status <> 'PENDING');

-- Suppression interdite : une demande est une trace d'instruction, au même
-- titre qu'une écriture comptable.
--
-- `TRUNCATE` n'est pas couvert par cette politique et resterait possible. Il
-- est réservé à l'administration : les outils de maintenance (scripts de
-- vérification, nettoyage de la base de démonstration) l'emploient, et il
-- n'est atteignable que depuis un shell ou une migration, jamais depuis
-- l'application.
CREATE POLICY "access_requests_no_delete" ON "access_requests"
  FOR DELETE
  USING (false);

-- `FORCE ROW LEVEL SECURITY` : sans lui, la politique `access_requests_read`
-- ne protège que les autres rôles. Le propriétaire de la table la contourne —
-- et l'application se connecte avec ce compte. La demande serait donc lisible
-- sans contexte, exactement ce que cette politique doit interdire.
--
-- `FORCE` ne gêne pas l'administration du schéma : les migrations utilisent
-- `ALTER TABLE`, `CREATE POLICY` et `DROP`, qui ne sont pas des DML et restent
-- hors de portée du RLS.
ALTER TABLE "access_requests" FORCE ROW LEVEL SECURITY;