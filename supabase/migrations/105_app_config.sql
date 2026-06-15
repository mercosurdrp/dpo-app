-- =============================================
-- 105 · app_config (key-value genérico)
-- =============================================
-- Configuración simple clave→valor. Primer uso: meta de días sin accidente del
-- bloque de Seguridad (clave 'seguridad_meta_dias'). RLS: auth lee y escribe;
-- el control fino (editor) lo hace el server action.
-- =============================================
BEGIN;

CREATE TABLE IF NOT EXISTS app_config (
  clave       text PRIMARY KEY,
  valor       text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_select_auth" ON app_config;
CREATE POLICY "app_config_select_auth"
  ON app_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_config_write_auth" ON app_config;
CREATE POLICY "app_config_write_auth"
  ON app_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
