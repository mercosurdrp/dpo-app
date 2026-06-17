-- =============================================
-- 116 · NPS · Punto 4.1 Planeamiento (Análisis y plan centrado en el cliente)
-- =============================================
-- Sección NPS de Pampeana: encuestas NPS de clientes (extraídas del Power BI
-- compartido por Quilmes) enriquecidas con el promotor vigente de Chess,
-- métricas mensuales de cruce (RMD del mismo Power BI) y planes de acción
-- centrados en el cliente (R4.1.2) con seguimiento estilo Action Log.
--
-- El cruce R4.1.3 (NPS vs OTIF/nivel de servicio) usa la tabla `rechazos`
-- existente con la definición de OTIF interno de 109_pc_otif_real_desde_rechazos:
-- OTIF = 1 - bultos_rechazados / bultos_entregados.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- =============================================
-- a) Encuestas NPS (base del Power BI Quilmes + promotor Chess)
-- =============================================
CREATE TABLE IF NOT EXISTS nps_encuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_enc TIMESTAMPTZ NOT NULL,
  cod_cliente BIGINT NOT NULL,            -- idCliente Chess (sufijo del COD CLIENTE DIST)
  nombre_cliente TEXT,
  localidad TEXT,
  score SMALLINT NOT NULL,
  categoria TEXT NOT NULL,                -- Promoter / Passive / Detractor
  driver_primario TEXT,
  driver_secundario TEXT,
  drivers JSONB,                          -- pares [primario, secundario] (el export del PBI trae una fila por par)
  comentario TEXT,
  segmento_venta TEXT,
  segmento_mkt TEXT,
  promotor TEXT,                          -- vendedor de preventa vigente en Chess al momento de la carga
  id_ruta INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nps_encuestas_categoria_chk CHECK (
    categoria IN ('Promoter', 'Passive', 'Detractor')
  ),
  CONSTRAINT nps_encuestas_score_chk CHECK (score BETWEEN 0 AND 10),
  CONSTRAINT nps_encuestas_unica UNIQUE (fecha_enc, cod_cliente)
);

CREATE INDEX IF NOT EXISTS idx_nps_encuestas_fecha ON nps_encuestas(fecha_enc);
CREATE INDEX IF NOT EXISTS idx_nps_encuestas_cliente ON nps_encuestas(cod_cliente);
CREATE INDEX IF NOT EXISTS idx_nps_encuestas_promotor ON nps_encuestas(promotor);

ALTER TABLE nps_encuestas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_encuestas_select_auth" ON nps_encuestas;
CREATE POLICY "nps_encuestas_select_auth"
  ON nps_encuestas FOR SELECT TO authenticated
  USING (true);

-- Escritura: solo editores (la carga regular la hace el sync con service_role)
DROP POLICY IF EXISTS "nps_encuestas_write" ON nps_encuestas;
CREATE POLICY "nps_encuestas_write"
  ON nps_encuestas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON nps_encuestas TO anon, authenticated, service_role;

-- =============================================
-- b) Métricas mensuales para el cruce R4.1.3 (RMD del Power BI Quilmes)
-- =============================================
CREATE TABLE IF NOT EXISTS nps_metricas_mensuales (
  anio INT NOT NULL,
  mes INT NOT NULL,
  rmd NUMERIC,                            -- Rate My Delivery promedio (1-5)
  rmd_enviadas INT,
  rmd_puntuadas INT,
  rmd_detractores INT,
  notas TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes),
  CONSTRAINT nps_metricas_mes_chk CHECK (mes BETWEEN 1 AND 12)
);

ALTER TABLE nps_metricas_mensuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_metricas_select_auth" ON nps_metricas_mensuales;
CREATE POLICY "nps_metricas_select_auth"
  ON nps_metricas_mensuales FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "nps_metricas_write" ON nps_metricas_mensuales;
CREATE POLICY "nps_metricas_write"
  ON nps_metricas_mensuales FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON nps_metricas_mensuales TO anon, authenticated, service_role;

-- =============================================
-- c) Planes de acción centrados en el cliente (R4.1.2)
--    Modelado sobre 098_rechazos_planes_accion.
-- =============================================
CREATE TABLE IF NOT EXISTS nps_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Foco del plan (opcionales; un plan puede atarse a un driver de
  -- insatisfacción, a un cliente detractor/pasivo, a un promotor, o ser general)
  foco_driver TEXT,
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

  CONSTRAINT nps_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT nps_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT nps_planes_prioridad_chk CHECK (
    prioridad IN ('alta', 'media', 'baja')
  )
);

CREATE INDEX IF NOT EXISTS idx_nps_planes_cliente ON nps_planes(foco_cliente_id);
CREATE INDEX IF NOT EXISTS idx_nps_planes_estado ON nps_planes(estado);
CREATE INDEX IF NOT EXISTS idx_nps_planes_created ON nps_planes(created_at);

ALTER TABLE nps_planes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_planes_select_auth" ON nps_planes;
CREATE POLICY "nps_planes_select_auth"
  ON nps_planes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "nps_planes_insert" ON nps_planes;
CREATE POLICY "nps_planes_insert"
  ON nps_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "nps_planes_update" ON nps_planes;
CREATE POLICY "nps_planes_update"
  ON nps_planes FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR responsable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "nps_planes_delete" ON nps_planes;
CREATE POLICY "nps_planes_delete"
  ON nps_planes FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON nps_planes TO anon, authenticated, service_role;

-- =============================================
-- d) Avances de planes (seguimiento + evidencia)
-- =============================================
CREATE TABLE IF NOT EXISTS nps_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nps_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                       -- bucket 'nps-planes'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nps_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT nps_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_nps_avances_plan ON nps_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_nps_avances_created ON nps_planes_avances(created_at);

ALTER TABLE nps_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_avances_select_auth" ON nps_planes_avances;
CREATE POLICY "nps_avances_select_auth"
  ON nps_planes_avances FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "nps_avances_insert" ON nps_planes_avances;
CREATE POLICY "nps_avances_insert"
  ON nps_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM nps_planes
      WHERE created_by = auth.uid() OR responsable_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "nps_avances_delete" ON nps_planes_avances;
CREATE POLICY "nps_avances_delete"
  ON nps_planes_avances FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON nps_planes_avances TO anon, authenticated, service_role;

-- =============================================
-- e) OTIF interno mensual para el cruce R4.1.3
--    (misma definición que 109_pc_otif_real_desde_rechazos)
-- =============================================
CREATE OR REPLACE VIEW v_nps_otif_mensual AS
SELECT
  extract(year from fecha)::int AS anio,
  extract(month from fecha)::int AS mes,
  sum(bultos_rechazados) AS bultos_rechazados,
  sum(bultos_entregados) AS bultos_entregados,
  CASE WHEN sum(bultos_entregados) > 0
    THEN round((1 - sum(bultos_rechazados)::numeric / sum(bultos_entregados)) * 100, 2)
    ELSE NULL END AS otif_interno
FROM rechazos
GROUP BY 1, 2;

GRANT SELECT ON v_nps_otif_mensual TO anon, authenticated, service_role;

-- =============================================
-- f) Bucket de evidencias
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('nps-planes', 'nps-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "nps_planes_storage_read" ON storage.objects;
CREATE POLICY "nps_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'nps-planes');

DROP POLICY IF EXISTS "nps_planes_storage_insert" ON storage.objects;
CREATE POLICY "nps_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'nps-planes');

DROP POLICY IF EXISTS "nps_planes_storage_delete" ON storage.objects;
CREATE POLICY "nps_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'nps-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
