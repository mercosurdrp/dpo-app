-- =============================================
-- 076 · Herramientas de Gestión (5 Porqués / Causa-Efecto / PDCA) aplicadas a planes_accion.
-- Aditivo y seguro para ambos tenants. Idempotente.
-- =============================================

BEGIN;

-- =============================================
-- a) Tabla principal
-- =============================================
CREATE TABLE IF NOT EXISTS plan_herramientas_gestion (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID        NOT NULL
                REFERENCES planes_accion(id) ON DELETE CASCADE,
  tipo        TEXT        NOT NULL
                CHECK (tipo IN ('cinco_porques', 'causa_efecto', 'pdca')),
  titulo      TEXT,
  contenido   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  pdf_path    TEXT,                       -- bucket 'plan-herramientas', para PDFs futuros
  autor_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_herramientas_plan_id
  ON plan_herramientas_gestion(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_herramientas_tipo
  ON plan_herramientas_gestion(tipo);
CREATE INDEX IF NOT EXISTS idx_plan_herramientas_autor_id
  ON plan_herramientas_gestion(autor_id);
CREATE INDEX IF NOT EXISTS idx_plan_herramientas_created_at
  ON plan_herramientas_gestion(created_at);

ALTER TABLE plan_herramientas_gestion ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier authenticated
DROP POLICY IF EXISTS "herramientas_gestion_select_auth"
  ON plan_herramientas_gestion;
CREATE POLICY "herramientas_gestion_select_auth"
  ON plan_herramientas_gestion FOR SELECT TO authenticated
  USING (true);

-- INSERT: responsable (cualquier rol en plan_responsables), creador del
-- plan, o admin/supervisor/admin_rrhh.
DROP POLICY IF EXISTS "herramientas_gestion_insert"
  ON plan_herramientas_gestion;
CREATE POLICY "herramientas_gestion_insert"
  ON plan_herramientas_gestion FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT plan_id FROM plan_responsables
      WHERE profile_id = auth.uid()
    )
    OR plan_id IN (
      SELECT id FROM planes_accion
      WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE: misma condición que INSERT
DROP POLICY IF EXISTS "herramientas_gestion_update"
  ON plan_herramientas_gestion;
CREATE POLICY "herramientas_gestion_update"
  ON plan_herramientas_gestion FOR UPDATE TO authenticated
  USING (
    plan_id IN (
      SELECT plan_id FROM plan_responsables
      WHERE profile_id = auth.uid()
    )
    OR plan_id IN (
      SELECT id FROM planes_accion
      WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    plan_id IN (
      SELECT plan_id FROM plan_responsables
      WHERE profile_id = auth.uid()
    )
    OR plan_id IN (
      SELECT id FROM planes_accion
      WHERE created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- DELETE: autor de la herramienta, o admin/supervisor/admin_rrhh.
DROP POLICY IF EXISTS "herramientas_gestion_delete"
  ON plan_herramientas_gestion;
CREATE POLICY "herramientas_gestion_delete"
  ON plan_herramientas_gestion FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON plan_herramientas_gestion
  TO anon, authenticated, service_role;

-- =============================================
-- b) Bucket de archivos
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-herramientas', 'plan-herramientas', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "plan_herramientas_storage_read" ON storage.objects;
CREATE POLICY "plan_herramientas_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'plan-herramientas');

DROP POLICY IF EXISTS "plan_herramientas_storage_insert" ON storage.objects;
CREATE POLICY "plan_herramientas_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'plan-herramientas');

DROP POLICY IF EXISTS "plan_herramientas_storage_delete" ON storage.objects;
CREATE POLICY "plan_herramientas_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'plan-herramientas');

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
