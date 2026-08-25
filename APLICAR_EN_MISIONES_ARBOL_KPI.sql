-- =============================================
-- Árbol de KPI · configuración por nodo + planes de acción
-- =============================================
-- Responde la devolución DPO H1 del pilar Gestión:
--   2.3 «Desarrollar arból de KPIs» (nota 0, MANDATORIA)
--   3.7 «Sumar valores gatillo para indicadores criticos» (nota 1)
--   4.1 «Planificar performance targets» (nota 1)
--   4.3 PDCA (nota 0) → causa raíz + baseline + avances con evidencia + cierre
--
-- `arbol_kpi_config`: la TOPOLOGÍA del árbol sigue viviendo en el código
-- (src/lib/arbol-kpi/rechazo.ts), acá van sólo los valores que la operación
-- gestiona y que deben poder cambiar sin un deploy — meta, gatillo, responsable.
-- Mismo criterio que `sueno_kpi_valores` en el Árbol del Sueño.
--
-- `arbol_kpi_planes` + `_avances`: modelado sobre 20260721180000_tiempo_pdv_planes
-- (el molde estándar de planes de la app), con el foco puesto en el nodo.
-- Se usa ese molde y NO el de tml_plan_accion porque aquél guarda el
-- responsable como texto libre y por eso quedó fuera del tablero unificado.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. Configuración por nodo (meta / gatillo / responsable), por año
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arbol_kpi_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Qué árbol: hoy sólo 'rechazo', pero la tabla ya soporta los que vengan.
  arbol TEXT NOT NULL DEFAULT 'rechazo',
  -- key del nodo en la topología del código. Texto plano, sin FK.
  nodo_key TEXT NOT NULL,
  anio INT NOT NULL,
  -- Objetivo del nodo. NULL = informativo, sin semáforo.
  meta NUMERIC,
  -- Umbral rojo: cruzarlo exige analizar el indicador y abrir un plan.
  gatillo NUMERIC,
  -- Quién responde por este PI. Es lo primero que pregunta el auditor.
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Por qué ese objetivo (p80 del histórico, acuerdo con la operación, etc.).
  nota TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  CONSTRAINT arbol_kpi_config_unq UNIQUE (arbol, nodo_key, anio)
);

CREATE INDEX IF NOT EXISTS idx_arbol_kpi_config_anio ON arbol_kpi_config(arbol, anio);

ALTER TABLE arbol_kpi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arbol_kpi_config_select_auth" ON arbol_kpi_config;
CREATE POLICY "arbol_kpi_config_select_auth"
  ON arbol_kpi_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "arbol_kpi_config_write" ON arbol_kpi_config;
CREATE POLICY "arbol_kpi_config_write"
  ON arbol_kpi_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON arbol_kpi_config TO anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. Planes de acción por nodo
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arbol_kpi_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Foco: el nodo del árbol. `nodo_label` va denormalizado a propósito, para
  -- que un plan viejo siga siendo legible si mañana la topología cambia.
  arbol TEXT NOT NULL DEFAULT 'rechazo',
  nodo_key TEXT NOT NULL,
  nodo_label TEXT,
  nodo_nivel TEXT,
  -- PDCA: por qué pasa lo que pasa, y contra qué número se compara el cierre.
  causa_raiz TEXT,
  baseline_valor NUMERIC,
  baseline_fecha TIMESTAMPTZ,
  meta_valor NUMERIC,
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT arbol_kpi_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT arbol_kpi_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT arbol_kpi_planes_prioridad_chk CHECK (
    prioridad IN ('alta', 'media', 'baja')
  )
);

CREATE INDEX IF NOT EXISTS idx_arbol_kpi_planes_nodo ON arbol_kpi_planes(arbol, nodo_key);
CREATE INDEX IF NOT EXISTS idx_arbol_kpi_planes_estado ON arbol_kpi_planes(estado);
CREATE INDEX IF NOT EXISTS idx_arbol_kpi_planes_created ON arbol_kpi_planes(created_at);

ALTER TABLE arbol_kpi_planes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arbol_kpi_planes_select_auth" ON arbol_kpi_planes;
CREATE POLICY "arbol_kpi_planes_select_auth"
  ON arbol_kpi_planes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "arbol_kpi_planes_insert" ON arbol_kpi_planes;
CREATE POLICY "arbol_kpi_planes_insert"
  ON arbol_kpi_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "arbol_kpi_planes_update" ON arbol_kpi_planes;
CREATE POLICY "arbol_kpi_planes_update"
  ON arbol_kpi_planes FOR UPDATE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR responsable_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "arbol_kpi_planes_delete" ON arbol_kpi_planes;
CREATE POLICY "arbol_kpi_planes_delete"
  ON arbol_kpi_planes FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON arbol_kpi_planes TO anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. Avances del plan (evidencia del PDCA)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS arbol_kpi_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES arbol_kpi_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  -- Multiarchivo desde el día 1; las 4 columnas sueltas quedan por compat.
  archivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  archivo_path TEXT,
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT arbol_kpi_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> '' OR archivo_path IS NOT NULL
  ),
  CONSTRAINT arbol_kpi_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_arbol_kpi_avances_plan ON arbol_kpi_planes_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_arbol_kpi_avances_created ON arbol_kpi_planes_avances(created_at);

ALTER TABLE arbol_kpi_planes_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arbol_kpi_avances_select_auth" ON arbol_kpi_planes_avances;
CREATE POLICY "arbol_kpi_avances_select_auth"
  ON arbol_kpi_planes_avances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "arbol_kpi_avances_insert" ON arbol_kpi_planes_avances;
CREATE POLICY "arbol_kpi_avances_insert"
  ON arbol_kpi_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM arbol_kpi_planes
      WHERE created_by = (select auth.uid()) OR responsable_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "arbol_kpi_avances_delete" ON arbol_kpi_planes_avances;
CREATE POLICY "arbol_kpi_avances_delete"
  ON arbol_kpi_planes_avances FOR DELETE TO authenticated
  USING (
    autor_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON arbol_kpi_planes_avances TO anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- 4. Bucket de evidencia
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('arbol-kpi-planes', 'arbol-kpi-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "arbol_kpi_planes_storage_read" ON storage.objects;
CREATE POLICY "arbol_kpi_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'arbol-kpi-planes');

DROP POLICY IF EXISTS "arbol_kpi_planes_storage_insert" ON storage.objects;
CREATE POLICY "arbol_kpi_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'arbol-kpi-planes');

DROP POLICY IF EXISTS "arbol_kpi_planes_storage_delete" ON storage.objects;
CREATE POLICY "arbol_kpi_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'arbol-kpi-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
