-- =============================================
-- 155 · TLP · Planes de acción + seguimiento con evidencia
-- =============================================
-- Planes de acción sobre el indicador TLP (Transport Labor Productivity),
-- atados opcionalmente a una CIUDAD y/o a un CAMIÓN (patente), con
-- seguimiento incremental (cada avance = comentario y/o archivo + estado).
-- Modelado sobre 098_rechazos_planes_accion. Archivos en bucket 'tlp-planes'.
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- =============================================
-- a) Tabla de planes
-- =============================================
CREATE TABLE IF NOT EXISTS tlp_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Foco del plan (opcional): ciudad y/o patente. Texto plano (denormalizado),
  -- sin FK estricta para no acoplarlo a maestros que pueden cambiar.
  foco_ciudad TEXT,                          -- ej. 'PERGAMINO', 'RAMALLO'
  foco_patente TEXT,                         -- ej. 'AF028YB'
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tlp_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT tlp_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT tlp_planes_prioridad_chk CHECK (
    prioridad IN ('alta', 'media', 'baja')
  )
);

CREATE INDEX IF NOT EXISTS idx_tlp_planes_ciudad ON tlp_planes(foco_ciudad);
CREATE INDEX IF NOT EXISTS idx_tlp_planes_patente ON tlp_planes(foco_patente);
CREATE INDEX IF NOT EXISTS idx_tlp_planes_estado ON tlp_planes(estado);
CREATE INDEX IF NOT EXISTS idx_tlp_planes_created ON tlp_planes(created_at);

ALTER TABLE tlp_planes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tlp_planes_select_auth" ON tlp_planes;
CREATE POLICY "tlp_planes_select_auth"
  ON tlp_planes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tlp_planes_insert" ON tlp_planes;
CREATE POLICY "tlp_planes_insert"
  ON tlp_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "tlp_planes_update" ON tlp_planes;
CREATE POLICY "tlp_planes_update"
  ON tlp_planes FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR responsable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "tlp_planes_delete" ON tlp_planes;
CREATE POLICY "tlp_planes_delete"
  ON tlp_planes FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON tlp_planes TO anon, authenticated, service_role;

-- =============================================
-- b) Tabla de avances (seguimiento + evidencia)
-- =============================================
CREATE TABLE IF NOT EXISTS tlp_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES tlp_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                       -- bucket 'tlp-planes'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tlp_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT tlp_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_tlp_avances_plan ON tlp_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_tlp_avances_created ON tlp_planes_avances(created_at);

ALTER TABLE tlp_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tlp_avances_select_auth" ON tlp_planes_avances;
CREATE POLICY "tlp_avances_select_auth"
  ON tlp_planes_avances FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tlp_avances_insert" ON tlp_planes_avances;
CREATE POLICY "tlp_avances_insert"
  ON tlp_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM tlp_planes
      WHERE created_by = auth.uid() OR responsable_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "tlp_avances_delete" ON tlp_planes_avances;
CREATE POLICY "tlp_avances_delete"
  ON tlp_planes_avances FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON tlp_planes_avances TO anon, authenticated, service_role;

-- =============================================
-- c) Bucket de archivos (evidencia)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('tlp-planes', 'tlp-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tlp_planes_storage_read" ON storage.objects;
CREATE POLICY "tlp_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tlp-planes');

DROP POLICY IF EXISTS "tlp_planes_storage_insert" ON storage.objects;
CREATE POLICY "tlp_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tlp-planes');

DROP POLICY IF EXISTS "tlp_planes_storage_delete" ON storage.objects;
CREATE POLICY "tlp_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tlp-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
