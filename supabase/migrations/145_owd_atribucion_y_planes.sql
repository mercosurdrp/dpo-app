-- =============================================
-- 145 · OWD · Atribución por ítem + Planes de acción + Tendencia por operario
-- =============================================
-- Tres cosas, todas para el módulo OWD (Observación en el Puesto de trabajo):
--
-- 1) ATRIBUCIÓN POR ÍTEM (owd_items.responsable): cada ítem del checklist se
--    atribuye a 'operario' | 'sdr' | 'proceso'. Sirve para que la tendencia por
--    operario sólo lo "marque en rojo" por lo que SÍ depende de él, y no por
--    cosas del SDR (reunión matinal) o del proceso/admin (documentación).
--    Backfill del checklist Pre-Ruta con la atribución por defecto.
--
-- 2) PLANES DE ACCIÓN (owd_planes + owd_planes_avances): cuando una OWD no
--    cumple, se abre un plan de acción a uno de dos niveles:
--      - origen = 'observacion' → plan puntual sobre una auditoría concreta.
--      - origen = 'operario'    → plan de mejora sobre un operario reincidente.
--    Con seguimiento de avances (comentario + estado) y evidencia opcional.
--
-- Sólo Pampeana (es donde corre el módulo OWD con este alcance). Idempotente:
-- se puede correr más de una vez. RLS con el patrón inline de profiles.role,
-- igual que 139_rmd_dashboard (admin/supervisor/admin_rrhh escriben).
-- =============================================

BEGIN;

-- Helper updated_at (idéntico al de 001/080, por si no existiera).
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 1) Atribución por ítem
-- ---------------------------------------------
ALTER TABLE owd_items
  ADD COLUMN IF NOT EXISTS responsable TEXT NOT NULL DEFAULT 'operario';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'owd_items_responsable_chk'
  ) THEN
    ALTER TABLE owd_items
      ADD CONSTRAINT owd_items_responsable_chk
      CHECK (responsable IN ('operario', 'sdr', 'proceso'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_owd_items_responsable ON owd_items(responsable);

-- Backfill de atribución del checklist Pre-Ruta (misma regla que el análisis):
-- los ítems del SDR / reunión y los de admin NO son del operario observado.
UPDATE owd_items SET responsable = 'sdr'
WHERE responsable = 'operario'
  AND (texto ILIKE 'SDR %' OR texto ILIKE '%Se tratan los temas%');

UPDATE owd_items SET responsable = 'proceso'
WHERE responsable = 'operario'
  AND texto ILIKE 'Documentación completa%';

-- ---------------------------------------------
-- 2) Planes de acción OWD
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS owd_planes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID REFERENCES owd_templates(id) ON DELETE SET NULL,
  -- Nivel del plan: puntual (una observación) o de mejora (un operario).
  origen          TEXT NOT NULL DEFAULT 'observacion',
  observacion_id  UUID REFERENCES owd_observaciones(id) ON DELETE SET NULL,
  operario        TEXT,                  -- nombre del operario foco (libre, viene del dropdown)
  titulo          TEXT NOT NULL,
  descripcion     TEXT,                  -- qué se va a hacer
  causa_raiz      TEXT,                  -- por qué pasó
  prioridad       TEXT NOT NULL DEFAULT 'media',
  estado          TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo  DATE,
  baseline_pct    NUMERIC,               -- % de cumplimiento al abrir el plan
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT owd_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT owd_planes_origen_chk CHECK (origen IN ('observacion', 'operario')),
  CONSTRAINT owd_planes_estado_chk CHECK (estado IN ('pendiente', 'en_progreso', 'completado')),
  CONSTRAINT owd_planes_prioridad_chk CHECK (prioridad IN ('alta', 'media', 'baja'))
);

CREATE INDEX IF NOT EXISTS idx_owd_planes_template ON owd_planes(template_id);
CREATE INDEX IF NOT EXISTS idx_owd_planes_obs ON owd_planes(observacion_id);
CREATE INDEX IF NOT EXISTS idx_owd_planes_operario ON owd_planes(operario);

DROP TRIGGER IF EXISTS trg_owd_planes_updated_at ON owd_planes;
CREATE TRIGGER trg_owd_planes_updated_at
  BEFORE UPDATE ON owd_planes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE owd_planes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owd_planes_read" ON owd_planes;
CREATE POLICY "owd_planes_read" ON owd_planes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "owd_planes_insert" ON owd_planes;
CREATE POLICY "owd_planes_insert" ON owd_planes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "owd_planes_update" ON owd_planes;
CREATE POLICY "owd_planes_update" ON owd_planes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR responsable_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
               AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "owd_planes_delete" ON owd_planes;
CREATE POLICY "owd_planes_delete" ON owd_planes
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
               AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

GRANT ALL ON owd_planes TO anon, authenticated, service_role;

-- ---------------------------------------------
-- 3) Avances de planes OWD (seguimiento + evidencia)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS owd_planes_avances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES owd_planes(id) ON DELETE CASCADE,
  comentario        TEXT,
  archivo_path      TEXT,                -- bucket 'owd-planes'
  archivo_nombre    TEXT,
  archivo_mime      TEXT,
  archivo_bytes     BIGINT,
  estado_resultante TEXT,
  autor_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT owd_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> '' OR archivo_path IS NOT NULL
  ),
  CONSTRAINT owd_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_owd_avances_plan ON owd_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_owd_avances_created ON owd_planes_avances(created_at);

ALTER TABLE owd_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owd_avances_read" ON owd_planes_avances;
CREATE POLICY "owd_avances_read" ON owd_planes_avances
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "owd_avances_insert" ON owd_planes_avances;
CREATE POLICY "owd_avances_insert" ON owd_planes_avances
  FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (SELECT id FROM owd_planes
                WHERE created_by = auth.uid() OR responsable_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
               AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "owd_avances_delete" ON owd_planes_avances;
CREATE POLICY "owd_avances_delete" ON owd_planes_avances
  FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
               AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

GRANT ALL ON owd_planes_avances TO anon, authenticated, service_role;

-- ---------------------------------------------
-- 4) Bucket de evidencias de planes OWD
-- ---------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('owd-planes', 'owd-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "owd_planes_storage_read" ON storage.objects;
CREATE POLICY "owd_planes_storage_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'owd-planes');

DROP POLICY IF EXISTS "owd_planes_storage_insert" ON storage.objects;
CREATE POLICY "owd_planes_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'owd-planes');

DROP POLICY IF EXISTS "owd_planes_storage_delete" ON storage.objects;
CREATE POLICY "owd_planes_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'owd-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
