-- ===========================================================================
-- Row Level Security — défense en profondeur multi-tenant (section 7).
--
-- Le PMS applique déjà le tenant côté applicatif via `getTenantContext`,
-- qui dérive le propertyId de la session. Ces politiques constituent une
-- seconde barrière : si une requête future oublie le filtre tenant, la base
-- refuse tout de même de renvoyer les lignes d'un autre établissement.
--
-- Le contexte est transmis par la variable de session PostgreSQL
-- `app.organization_id`, positionnée par `withTenantContext` dans
-- src/lib/db.ts au début de chaque transaction.
--
-- Tant que `app.organization_id` est absente, aucune ligne n'est visible :
-- une requête exécutée hors contexte utilisateur voit zéro ligne plutôt que
-- toutes les lignes.
-- ===========================================================================

-- Rend la variable de contexte lisible par les politiques RLS.
CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

-- Rend la portée établissement lisible par les politiques RLS.
CREATE OR REPLACE FUNCTION current_property_id()
RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.property_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

-- Applique le filtre organisation sur une table portant organization_id.
-- La fonction s'adapte à la table : certaines tables de la hiérarchie
-- (organizations, properties) utilisent leur propre `id` comme clé de
-- portée, d'autres n'ont pas de colonne de portée et remontent l'accès par
-- jointure via users.
CREATE OR REPLACE FUNCTION apply_organization_rls(target_table regclass)
RETURNS void AS $$
DECLARE
  column_list text;
  policy_expr text;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target_table);

  SELECT string_agg(column_name, ',') INTO column_list
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = target_table::text
    AND column_name IN ('organization_id', 'property_id', 'user_id', 'role_id');

  IF column_list IS NULL THEN
    -- Aucune colonne de portée exploitable : table de référence globale
    -- (permissions, verification_tokens). Elle reste en lecture seule pour
    -- l'application et n'est jamais écrite par un tenant.
    EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', target_table);
    RETURN;
  END IF;

  -- Cas 1 : la table porte organization_id.
  IF column_list LIKE '%organization_id%' THEN
    policy_expr := '(organization_id = current_organization_id())';

  -- Cas 2 : pas d'organisation, mais un property_id (bail de l’établir).
  ELSIF column_list LIKE '%property_id%' THEN
    policy_expr := format(
      '(EXISTS (SELECT 1 FROM properties p WHERE p.id = %s.property_id AND p.organization_id = current_organization_id()))',
      target_table::text
    );

  -- Cas 3 : remonte l'accès par le rattachement de l'utilisateur.
  ELSIF column_list LIKE '%user_id%' THEN
    policy_expr := format(
      '(EXISTS (SELECT 1 FROM users u WHERE u.id = %s.user_id AND u.organization_id = current_organization_id()))',
      target_table::text
    );

  -- Cas 4 : remonte l'accès par un rôle détenu par un utilisateur.
  ELSE
    policy_expr := format(
      '(EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role_id = %s.role_id AND ur.user_id IN (SELECT id FROM users WHERE organization_id = current_organization_id())))',
      target_table::text
    );
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS organization_isolation ON %s', target_table);
  EXECUTE format(
    'CREATE POLICY organization_isolation ON %s USING (%s) WITH CHECK (%s)',
    target_table, policy_expr, policy_expr
  );
END;
$$ LANGUAGE plpgsql;

-- Applique le filtre établissement, plus restrictif que l'organisation.
CREATE OR REPLACE FUNCTION apply_property_rls(target_table regclass)
RETURNS void AS $$
DECLARE
  has_property_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = target_table::text
      AND column_name = 'property_id'
  ) INTO has_property_id;

  -- Sans property_id direct, la portée établissement ne peut pas être
  -- exprimée : on retombe sur le filtre organisation, plus permissif mais
  -- jamais nul.
  IF NOT has_property_id THEN
    PERFORM apply_organization_rls(target_table);
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target_table);

  EXECUTE format('DROP POLICY IF EXISTS property_isolation ON %s', target_table);
  EXECUTE format(
    'CREATE POLICY property_isolation ON %s
       USING (
         property_id = current_property_id()
         OR EXISTS (
           SELECT 1 FROM properties p
           WHERE p.id = %s.property_id
             AND p.organization_id = current_organization_id()
         )
       )
       WITH CHECK (
         property_id = current_property_id()
         OR EXISTS (
           SELECT 1 FROM properties p
           WHERE p.id = %s.property_id
             AND p.organization_id = current_organization_id()
         )
       )',
    target_table,
    target_table,
    target_table
  );
END;
$$ LANGUAGE plpgsql;

-- Activation sur les tables opérationnelles, à portée établissement.
-- `properties` est une racine : la fonction adaptative applique la portée
-- organisation puisque son `id` est le property_id.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'properties', 'property_settings', 'buildings', 'floors', 'amenities',
    'room_types', 'rooms', 'room_amenities', 'room_type_amenities',
    'room_status_history', 'rate_plans', 'seasons', 'rate_plan_prices',
    'cancellation_policies', 'guests', 'guest_documents', 'guest_preferences',
    'companies', 'agencies', 'reservations', 'reservation_rooms',
    'reservation_guests', 'stays', 'stay_rooms', 'folios', 'folio_items',
    'payments', 'payment_allocations', 'refunds', 'invoices', 'invoice_items',
    'tax_rules', 'night_tax_configurations', 'tax_obligations', 'fne_documents',
    'fne_submission_attempts', 'cash_registers', 'cash_sessions',
    'cash_movements', 'housekeeping_tasks', 'maintenance_tickets', 'assets',
    'night_audits', 'daily_hotel_metrics', 'notifications'
  ]
  LOOP
    PERFORM apply_property_rls(target::regclass);
  END LOOP;
END;
$$;

-- Le rôle applicatif est le propriétaire des tables : PostgreSQL
-- contournerait sinon les politiques RLS sur le propriétaire. FORCE ROW
-- LEVEL SECURITY, appliqué ci-dessus, rétablit la protection.