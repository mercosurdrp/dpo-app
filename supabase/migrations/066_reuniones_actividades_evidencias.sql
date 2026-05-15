-- =============================================
-- 066 · Reuniones · Historial de avances por actividad (Action Log)
-- =============================================
-- Etapa 3 (Action Log): al clickear una actividad ya cargada se abre un
-- popup que muestra "qué se hizo". Hasta ahora reuniones_actividades solo
-- guardaba 1 evidencia (evidencia_url) + 1 observacion, sin historial.
--
-- Esta migración agrega la tabla reuniones_actividades_evidencias: cada
-- avance (comentario + archivo opcional) queda registrado con fecha y
-- autor, formando la línea de tiempo de la actividad.
--
-- Modelado sobre s5_acciones_evidencias (migración 059). Archivos en el
-- bucket 'reuniones', prefijo 'actividades/{actividad_id}/...'.
--
-- Incluye backfill: por cada actividad existente con observaciones y/o
-- evidencia se crea una entrada inicial en el historial.
--
-- Idempotente. NOTIFY pgrst al final fuera de transacción.
-- =============================================

BEGIN;

-- =============================================
-- a) Tabla de historial de avances
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_actividades_evidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id UUID NOT NULL
    REFERENCES reuniones_actividades(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                       -- bucket 'reuniones'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  -- Estado de la actividad resultante de este avance (para mostrar
  -- transiciones en la línea de tiempo, ej. "cerró la tarea").
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reuniones_act_evid_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT reuniones_act_evid_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('no_comenzada', 'en_curso', 'cerrada')
  )
);

CREATE INDEX IF NOT EXISTS idx_reuniones_act_evid_actividad
  ON reuniones_actividades_evidencias(actividad_id);
CREATE INDEX IF NOT EXISTS idx_reuniones_act_evid_autor
  ON reuniones_actividades_evidencias(autor_id);
CREATE INDEX IF NOT EXISTS idx_reuniones_act_evid_created
  ON reuniones_actividades_evidencias(created_at);

ALTER TABLE reuniones_actividades_evidencias ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier authenticated
DROP POLICY IF EXISTS "reuniones_act_evid_select_auth"
  ON reuniones_actividades_evidencias;
CREATE POLICY "reuniones_act_evid_select_auth"
  ON reuniones_actividades_evidencias FOR SELECT TO authenticated
  USING (true);

-- INSERT: editores, o el responsable de la actividad padre
DROP POLICY IF EXISTS "reuniones_act_evid_insert"
  ON reuniones_actividades_evidencias;
CREATE POLICY "reuniones_act_evid_insert"
  ON reuniones_actividades_evidencias FOR INSERT TO authenticated
  WITH CHECK (
    actividad_id IN (
      SELECT id FROM reuniones_actividades
      WHERE responsable_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- DELETE: el autor del avance, o editores
DROP POLICY IF EXISTS "reuniones_act_evid_delete"
  ON reuniones_actividades_evidencias;
CREATE POLICY "reuniones_act_evid_delete"
  ON reuniones_actividades_evidencias FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON reuniones_actividades_evidencias
  TO anon, authenticated, service_role;

-- =============================================
-- b) Backfill: entrada inicial por cada actividad con datos previos
-- =============================================
INSERT INTO reuniones_actividades_evidencias
  (actividad_id, comentario, archivo_path, archivo_nombre,
   estado_resultante, autor_id, created_at)
SELECT
  a.id,
  NULLIF(btrim(a.observaciones), ''),
  a.evidencia_url,
  a.evidencia_nombre,
  a.estado,
  a.created_by,
  a.updated_at
FROM reuniones_actividades a
WHERE (
    NULLIF(btrim(a.observaciones), '') IS NOT NULL
    OR a.evidencia_url IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM reuniones_actividades_evidencias e
    WHERE e.actividad_id = a.id
  );

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
