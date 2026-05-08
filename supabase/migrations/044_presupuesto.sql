-- =============================================
-- 044 · Presupuesto (módulo /presupuesto)
-- =============================================
-- Modelo:
--   1) presupuestos_anuales (1 archivo por año)
--   2) presupuestos_mensuales (1 archivo por (anio, mes))
--   3) presupuestos_tareas (acciones de análisis por (anio, mes, rubro))
--
-- El responsable de una tarea puede UPDATE para responderla (subir evidencia,
-- justificación, marcar completada). El resto de las mutaciones requiere
-- admin / supervisor / admin_rrhh.
-- =============================================

BEGIN;

-- =============================================
-- 1) Presupuesto anual
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_anuales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio            int  NOT NULL UNIQUE,
  archivo_url     text,
  archivo_nombre  text,
  observaciones   text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- =============================================
-- 2) Presupuesto mensual (estado del mes)
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_mensuales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio            int  NOT NULL,
  mes             int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  archivo_url     text,
  archivo_nombre  text,
  observaciones   text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_mensuales_anio_mes
  ON presupuestos_mensuales(anio, mes);


-- =============================================
-- 3) Tareas de análisis (acciones por desvío / rubro)
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_tareas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio                  int  NOT NULL,
  mes                   int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  rubro                 text NOT NULL,
  monto_presupuestado   numeric(14,2),
  monto_real            numeric(14,2),
  descripcion           text,
  responsable_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_limite          date,
  estado                text NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente','en_progreso','completada')),
  evidencia_url         text,
  evidencia_nombre      text,
  justificacion         text,
  completada_at         timestamptz,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN presupuestos_tareas.rubro IS
  'Rubro libre del análisis. Ej. "Contratación de Flota", "Combustibles", "Sueldos", etc.';

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_anio_mes
  ON presupuestos_tareas(anio, mes);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_responsable
  ON presupuestos_tareas(responsable_id);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_estado
  ON presupuestos_tareas(estado);


-- =============================================
-- 4) RLS
-- =============================================
ALTER TABLE presupuestos_anuales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos_tareas    ENABLE ROW LEVEL SECURITY;

-- ---- presupuestos_anuales ----
DROP POLICY IF EXISTS "presupuestos_anuales_select_auth" ON presupuestos_anuales;
CREATE POLICY "presupuestos_anuales_select_auth"
  ON presupuestos_anuales FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presupuestos_anuales_write_editors" ON presupuestos_anuales;
CREATE POLICY "presupuestos_anuales_write_editors"
  ON presupuestos_anuales FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- presupuestos_mensuales ----
DROP POLICY IF EXISTS "presupuestos_mensuales_select_auth" ON presupuestos_mensuales;
CREATE POLICY "presupuestos_mensuales_select_auth"
  ON presupuestos_mensuales FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presupuestos_mensuales_write_editors" ON presupuestos_mensuales;
CREATE POLICY "presupuestos_mensuales_write_editors"
  ON presupuestos_mensuales FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- presupuestos_tareas ----
DROP POLICY IF EXISTS "presupuestos_tareas_select_auth" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_select_auth"
  ON presupuestos_tareas FOR SELECT TO authenticated
  USING (true);

-- INSERT: solo editores
DROP POLICY IF EXISTS "presupuestos_tareas_insert_editors" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_insert_editors"
  ON presupuestos_tareas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE general: editores
DROP POLICY IF EXISTS "presupuestos_tareas_update_editors" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_update_editors"
  ON presupuestos_tareas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE responsable: el dueño de la tarea puede actualizarla (responder)
DROP POLICY IF EXISTS "presupuestos_tareas_update_responsable" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_update_responsable"
  ON presupuestos_tareas FOR UPDATE TO authenticated
  USING (responsable_id = auth.uid())
  WITH CHECK (responsable_id = auth.uid());

-- DELETE: solo editores
DROP POLICY IF EXISTS "presupuestos_tareas_delete_editors" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_delete_editors"
  ON presupuestos_tareas FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );


-- =============================================
-- 5) GRANTs explícitos (cache PostgREST)
-- =============================================
GRANT ALL ON presupuestos_anuales   TO anon, authenticated, service_role;
GRANT ALL ON presupuestos_mensuales TO anon, authenticated, service_role;
GRANT ALL ON presupuestos_tareas    TO anon, authenticated, service_role;


-- =============================================
-- 6) Triggers updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_presupuestos_anuales_updated_at ON presupuestos_anuales;
CREATE TRIGGER trg_presupuestos_anuales_updated_at
  BEFORE UPDATE ON presupuestos_anuales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_presupuestos_mensuales_updated_at ON presupuestos_mensuales;
CREATE TRIGGER trg_presupuestos_mensuales_updated_at
  BEFORE UPDATE ON presupuestos_mensuales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_presupuestos_tareas_updated_at ON presupuestos_tareas;
CREATE TRIGGER trg_presupuestos_tareas_updated_at
  BEFORE UPDATE ON presupuestos_tareas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================
-- 7) Storage bucket privado
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('presupuestos', 'presupuestos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "presupuestos_storage_read" ON storage.objects;
CREATE POLICY "presupuestos_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'presupuestos');

DROP POLICY IF EXISTS "presupuestos_storage_insert" ON storage.objects;
CREATE POLICY "presupuestos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'presupuestos'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "presupuestos_storage_delete" ON storage.objects;
CREATE POLICY "presupuestos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'presupuestos'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
