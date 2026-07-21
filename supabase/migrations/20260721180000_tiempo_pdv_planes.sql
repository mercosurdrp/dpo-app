-- =============================================
-- Tiempo por Punto de Venta · Planes de acción + seguimiento con evidencia
-- =============================================
-- Modelado sobre 155_tlp_planes_accion. La diferencia es `foco_cliente`: acá el
-- plan se ata al PDV concreto que consume el tiempo, que es la unidad sobre la
-- que se puede actuar (hablar con el cliente, mover la ventana horaria, revisar
-- el acceso). Ciudad y patente quedan como foco opcional adicional.
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS tiempo_pdv_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Foco del plan (todos opcionales). Texto plano, sin FK: los maestros de
  -- clientes cambian y no queremos que un plan histórico se rompa o se borre.
  foco_cliente_id TEXT,                      -- id_cliente, ej. '13737'
  foco_cliente TEXT,                         -- nombre al momento de crearlo
  foco_ciudad TEXT,
  foco_patente TEXT,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tiempo_pdv_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT tiempo_pdv_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT tiempo_pdv_planes_prioridad_chk CHECK (
    prioridad IN ('alta', 'media', 'baja')
  )
);

CREATE INDEX IF NOT EXISTS idx_tpdv_planes_cliente ON tiempo_pdv_planes(foco_cliente_id);
CREATE INDEX IF NOT EXISTS idx_tpdv_planes_ciudad ON tiempo_pdv_planes(foco_ciudad);
CREATE INDEX IF NOT EXISTS idx_tpdv_planes_patente ON tiempo_pdv_planes(foco_patente);
CREATE INDEX IF NOT EXISTS idx_tpdv_planes_estado ON tiempo_pdv_planes(estado);
CREATE INDEX IF NOT EXISTS idx_tpdv_planes_created ON tiempo_pdv_planes(created_at);

ALTER TABLE tiempo_pdv_planes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpdv_planes_select_auth" ON tiempo_pdv_planes;
CREATE POLICY "tpdv_planes_select_auth"
  ON tiempo_pdv_planes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tpdv_planes_insert" ON tiempo_pdv_planes;
CREATE POLICY "tpdv_planes_insert"
  ON tiempo_pdv_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "tpdv_planes_update" ON tiempo_pdv_planes;
CREATE POLICY "tpdv_planes_update"
  ON tiempo_pdv_planes FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR responsable_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "tpdv_planes_delete" ON tiempo_pdv_planes;
CREATE POLICY "tpdv_planes_delete"
  ON tiempo_pdv_planes FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON tiempo_pdv_planes TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS tiempo_pdv_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES tiempo_pdv_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tpdv_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> '' OR archivo_path IS NOT NULL
  ),
  CONSTRAINT tpdv_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_tpdv_avances_plan ON tiempo_pdv_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_tpdv_avances_created ON tiempo_pdv_planes_avances(created_at);

ALTER TABLE tiempo_pdv_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpdv_avances_select_auth" ON tiempo_pdv_planes_avances;
CREATE POLICY "tpdv_avances_select_auth"
  ON tiempo_pdv_planes_avances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tpdv_avances_insert" ON tiempo_pdv_planes_avances;
CREATE POLICY "tpdv_avances_insert"
  ON tiempo_pdv_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM tiempo_pdv_planes
      WHERE created_by = (select auth.uid()) OR responsable_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "tpdv_avances_delete" ON tiempo_pdv_planes_avances;
CREATE POLICY "tpdv_avances_delete"
  ON tiempo_pdv_planes_avances FOR DELETE TO authenticated
  USING (
    autor_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON tiempo_pdv_planes_avances TO anon, authenticated, service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('tiempo-pdv-planes', 'tiempo-pdv-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tpdv_planes_storage_read" ON storage.objects;
CREATE POLICY "tpdv_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tiempo-pdv-planes');

DROP POLICY IF EXISTS "tpdv_planes_storage_insert" ON storage.objects;
CREATE POLICY "tpdv_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tiempo-pdv-planes');

DROP POLICY IF EXISTS "tpdv_planes_storage_delete" ON storage.objects;
CREATE POLICY "tpdv_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tiempo-pdv-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
