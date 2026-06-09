-- =============================================
-- 098 · Rechazos · Planes de acción + seguimiento con evidencia
-- =============================================
-- Permite tomar planes de acción sobre el indicador de rechazos, atados
-- (opcionalmente) a un motivo de rechazo y/o a un cliente, con seguimiento
-- incremental estilo Action Log: cada avance = comentario (o archivo) +
-- archivo opcional (evidencia) + estado resultante.
--
-- Modelado sobre 070_planes_accion_avances. Archivos en el bucket
-- 'rechazos-planes', prefijo '{plan_id}/...'.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- =============================================
-- a) Tabla de planes
-- =============================================
CREATE TABLE IF NOT EXISTS rechazos_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Foco del plan (cualquiera opcional; un plan puede atarse a un motivo,
  -- a un cliente, a ambos, o ser general). Sin FK estricta para no acoplar
  -- el plan al catálogo/maestro (los ids vienen de la tabla `rechazos`).
  foco_motivo_id INT,                        -- catalogo_rechazos.id_rechazo
  foco_motivo_ds TEXT,                       -- denormalizado para mostrar
  foco_cliente_id INT,                       -- rechazos.id_cliente
  foco_cliente_nombre TEXT,                  -- denormalizado para mostrar
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rechazos_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT rechazos_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT rechazos_planes_prioridad_chk CHECK (
    prioridad IN ('alta', 'media', 'baja')
  )
);

CREATE INDEX IF NOT EXISTS idx_rechazos_planes_motivo
  ON rechazos_planes(foco_motivo_id);
CREATE INDEX IF NOT EXISTS idx_rechazos_planes_cliente
  ON rechazos_planes(foco_cliente_id);
CREATE INDEX IF NOT EXISTS idx_rechazos_planes_estado
  ON rechazos_planes(estado);
CREATE INDEX IF NOT EXISTS idx_rechazos_planes_created
  ON rechazos_planes(created_at);

ALTER TABLE rechazos_planes ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier authenticated
DROP POLICY IF EXISTS "rechazos_planes_select_auth" ON rechazos_planes;
CREATE POLICY "rechazos_planes_select_auth"
  ON rechazos_planes FOR SELECT TO authenticated
  USING (true);

-- INSERT: editores (admin/supervisor/admin_rrhh)
DROP POLICY IF EXISTS "rechazos_planes_insert" ON rechazos_planes;
CREATE POLICY "rechazos_planes_insert"
  ON rechazos_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE: creador, responsable, o editor
DROP POLICY IF EXISTS "rechazos_planes_update" ON rechazos_planes;
CREATE POLICY "rechazos_planes_update"
  ON rechazos_planes FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR responsable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- DELETE: creador o editor
DROP POLICY IF EXISTS "rechazos_planes_delete" ON rechazos_planes;
CREATE POLICY "rechazos_planes_delete"
  ON rechazos_planes FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON rechazos_planes TO anon, authenticated, service_role;

-- =============================================
-- b) Tabla de avances (seguimiento + evidencia)
-- =============================================
CREATE TABLE IF NOT EXISTS rechazos_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL
    REFERENCES rechazos_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                       -- bucket 'rechazos-planes'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rechazos_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT rechazos_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_rechazos_avances_plan
  ON rechazos_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_rechazos_avances_created
  ON rechazos_planes_avances(created_at);

ALTER TABLE rechazos_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rechazos_avances_select_auth" ON rechazos_planes_avances;
CREATE POLICY "rechazos_avances_select_auth"
  ON rechazos_planes_avances FOR SELECT TO authenticated
  USING (true);

-- INSERT: responsable/creador del plan, o editor
DROP POLICY IF EXISTS "rechazos_avances_insert" ON rechazos_planes_avances;
CREATE POLICY "rechazos_avances_insert"
  ON rechazos_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM rechazos_planes
      WHERE created_by = auth.uid() OR responsable_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- DELETE: autor del avance, o editor
DROP POLICY IF EXISTS "rechazos_avances_delete" ON rechazos_planes_avances;
CREATE POLICY "rechazos_avances_delete"
  ON rechazos_planes_avances FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON rechazos_planes_avances TO anon, authenticated, service_role;

-- =============================================
-- c) Bucket de archivos (evidencia)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('rechazos-planes', 'rechazos-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "rechazos_planes_storage_read" ON storage.objects;
CREATE POLICY "rechazos_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rechazos-planes');

DROP POLICY IF EXISTS "rechazos_planes_storage_insert" ON storage.objects;
CREATE POLICY "rechazos_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rechazos-planes');

DROP POLICY IF EXISTS "rechazos_planes_storage_delete" ON storage.objects;
CREATE POLICY "rechazos_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rechazos-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
