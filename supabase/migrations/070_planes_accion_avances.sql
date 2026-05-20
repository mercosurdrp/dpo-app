-- =============================================
-- 070 · Planes de Acción · Historial de avances (estilo Action Log)
-- =============================================
-- Plan/Tarea-directa pueden responderse con avances incrementales:
-- cada avance = comentario obligatorio (o archivo) + archivo opcional +
-- estado resultante. Convive con plan_comentarios, evidencia_planes y
-- dpo_archivo_planes (no se borran ni se migran datos).
--
-- Modelado sobre 066_reuniones_actividades_evidencias. Archivos en
-- el bucket 'planes-avances', prefijo '{plan_id}/...'.
--
-- Idempotente. NOTIFY pgrst al final fuera de transacción.
-- =============================================

BEGIN;

-- =============================================
-- a) Tabla de avances
-- =============================================
CREATE TABLE IF NOT EXISTS planes_accion_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL
    REFERENCES planes_accion(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                       -- bucket 'planes-avances'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  -- Estado del plan resultante de este avance (para mostrar
  -- transiciones en la línea de tiempo, ej. "cerró el plan").
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT planes_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT planes_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_planes_avances_plan
  ON planes_accion_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_planes_avances_autor
  ON planes_accion_avances(autor_id);
CREATE INDEX IF NOT EXISTS idx_planes_avances_created
  ON planes_accion_avances(created_at);

ALTER TABLE planes_accion_avances ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier authenticated
DROP POLICY IF EXISTS "planes_avances_select_auth"
  ON planes_accion_avances;
CREATE POLICY "planes_avances_select_auth"
  ON planes_accion_avances FOR SELECT TO authenticated
  USING (true);

-- INSERT: responsable (cualquier rol en plan_responsables), creador del
-- plan, o admin/supervisor/admin_rrhh.
DROP POLICY IF EXISTS "planes_avances_insert"
  ON planes_accion_avances;
CREATE POLICY "planes_avances_insert"
  ON planes_accion_avances FOR INSERT TO authenticated
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

-- DELETE: autor del avance, o admin/supervisor/admin_rrhh.
DROP POLICY IF EXISTS "planes_avances_delete"
  ON planes_accion_avances;
CREATE POLICY "planes_avances_delete"
  ON planes_accion_avances FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON planes_accion_avances
  TO anon, authenticated, service_role;

-- =============================================
-- b) Bucket de archivos
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('planes-avances', 'planes-avances', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "planes_avances_storage_read" ON storage.objects;
CREATE POLICY "planes_avances_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'planes-avances');

DROP POLICY IF EXISTS "planes_avances_storage_insert" ON storage.objects;
CREATE POLICY "planes_avances_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'planes-avances');

DROP POLICY IF EXISTS "planes_avances_storage_delete" ON storage.objects;
CREATE POLICY "planes_avances_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'planes-avances');

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
