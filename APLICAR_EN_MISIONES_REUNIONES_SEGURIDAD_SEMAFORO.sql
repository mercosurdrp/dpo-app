-- =============================================================
-- REUNIONES · Semáforo de seguridad del día (MISIONES)
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
-- =============================================================
-- Crea la tabla que guarda el color (rojo/amarillo/verde) del estado de
-- seguridad del día, por reunión. Va al lado de la pirámide en la Etapa 1.
-- SOLO Misiones (el código lo gatea con IS_MISIONES). Idempotente.
-- RLS espejo de reuniones_indicadores_valores.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reuniones_seguridad_semaforo (
  reunion_id      uuid PRIMARY KEY REFERENCES reuniones(id) ON DELETE CASCADE,
  estado          text NOT NULL CHECK (estado IN ('rojo', 'amarillo', 'verde')),
  actualizado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reuniones_seguridad_semaforo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rss_select_auth" ON reuniones_seguridad_semaforo;
CREATE POLICY "rss_select_auth"
  ON reuniones_seguridad_semaforo FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rss_insert" ON reuniones_seguridad_semaforo;
CREATE POLICY "rss_insert"
  ON reuniones_seguridad_semaforo FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
    OR actualizado_por = auth.uid()
  );

DROP POLICY IF EXISTS "rss_update" ON reuniones_seguridad_semaforo;
CREATE POLICY "rss_update"
  ON reuniones_seguridad_semaforo FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
    OR actualizado_por = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
    OR actualizado_por = auth.uid()
  );

DROP POLICY IF EXISTS "rss_all_service" ON reuniones_seguridad_semaforo;
CREATE POLICY "rss_all_service"
  ON reuniones_seguridad_semaforo FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
