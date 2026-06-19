-- =============================================
-- 139 · RMD (Rate My Delivery) · Dashboard + Planes de acción
-- =============================================
-- a) Enriquecer nps_rmd_cliente con nombre/promotor/localidad (el sync
--    quincenal del Power BI de Quilmes los completa; antes solo guardaba
--    cod_cliente). Permite un explorador legible de toda la base de RMD.
-- b) Planes de acción centrados en RMD bajo, espejo de nps_planes (R4.1.2),
--    con su seguimiento de avances/evidencia y baseline del RMD del cliente.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- =============================================
-- a) Enriquecimiento del RMD individual por cliente
-- =============================================
ALTER TABLE nps_rmd_cliente
  ADD COLUMN IF NOT EXISTS nombre_cliente TEXT,
  ADD COLUMN IF NOT EXISTS promotor TEXT,
  ADD COLUMN IF NOT EXISTS localidad TEXT;

-- Backfill de nombre/promotor/localidad desde las encuestas NPS para los
-- clientes que ya tienen encuesta (el sync luego completa el resto).
UPDATE nps_rmd_cliente r
SET nombre_cliente = COALESCE(r.nombre_cliente, sub.nombre_cliente),
    promotor = COALESCE(r.promotor, sub.promotor),
    localidad = COALESCE(r.localidad, sub.localidad)
FROM (
  SELECT DISTINCT ON (cod_cliente)
    cod_cliente, nombre_cliente, promotor, localidad
  FROM nps_encuestas
  ORDER BY cod_cliente, fecha_enc DESC
) sub
WHERE r.cod_cliente = sub.cod_cliente
  AND (r.nombre_cliente IS NULL OR r.promotor IS NULL OR r.localidad IS NULL);

-- =============================================
-- b) Planes de acción centrados en RMD (modelado sobre nps_planes)
-- =============================================
CREATE TABLE IF NOT EXISTS rmd_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Foco del plan (opcionales): un motivo de baja puntuación, un cliente
  -- con RMD bajo, un promotor, o un plan general.
  foco_motivo TEXT,
  foco_cliente_id BIGINT,
  foco_cliente_nombre TEXT,
  foco_promotor TEXT,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Baseline: foto del RMD del cliente foco al crear el plan.
  baseline_rmd NUMERIC,
  baseline_n INT,
  baseline_fecha TIMESTAMPTZ,

  CONSTRAINT rmd_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT rmd_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT rmd_planes_prioridad_chk CHECK (
    prioridad IN ('alta', 'media', 'baja')
  )
);

CREATE INDEX IF NOT EXISTS idx_rmd_planes_cliente ON rmd_planes(foco_cliente_id);
CREATE INDEX IF NOT EXISTS idx_rmd_planes_estado ON rmd_planes(estado);
CREATE INDEX IF NOT EXISTS idx_rmd_planes_created ON rmd_planes(created_at);

ALTER TABLE rmd_planes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rmd_planes_select_auth" ON rmd_planes;
CREATE POLICY "rmd_planes_select_auth"
  ON rmd_planes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rmd_planes_insert" ON rmd_planes;
CREATE POLICY "rmd_planes_insert"
  ON rmd_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "rmd_planes_update" ON rmd_planes;
CREATE POLICY "rmd_planes_update"
  ON rmd_planes FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR responsable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "rmd_planes_delete" ON rmd_planes;
CREATE POLICY "rmd_planes_delete"
  ON rmd_planes FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON rmd_planes TO anon, authenticated, service_role;

-- =============================================
-- c) Avances de planes RMD (seguimiento + evidencia)
-- =============================================
CREATE TABLE IF NOT EXISTS rmd_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES rmd_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                       -- bucket 'rmd-planes'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rmd_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT rmd_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_rmd_avances_plan ON rmd_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_rmd_avances_created ON rmd_planes_avances(created_at);

ALTER TABLE rmd_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rmd_avances_select_auth" ON rmd_planes_avances;
CREATE POLICY "rmd_avances_select_auth"
  ON rmd_planes_avances FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rmd_avances_insert" ON rmd_planes_avances;
CREATE POLICY "rmd_avances_insert"
  ON rmd_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM rmd_planes
      WHERE created_by = auth.uid() OR responsable_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "rmd_avances_delete" ON rmd_planes_avances;
CREATE POLICY "rmd_avances_delete"
  ON rmd_planes_avances FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON rmd_planes_avances TO anon, authenticated, service_role;

-- =============================================
-- d) Bucket de evidencias de planes RMD
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('rmd-planes', 'rmd-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "rmd_planes_storage_read" ON storage.objects;
CREATE POLICY "rmd_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rmd-planes');

DROP POLICY IF EXISTS "rmd_planes_storage_insert" ON storage.objects;
CREATE POLICY "rmd_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rmd-planes');

DROP POLICY IF EXISTS "rmd_planes_storage_delete" ON storage.objects;
CREATE POLICY "rmd_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rmd-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
