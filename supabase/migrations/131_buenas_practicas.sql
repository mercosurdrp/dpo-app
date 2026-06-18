-- =============================================
-- 131 · Buenas Prácticas · Punto 4.4 Gestión (Act)
-- =============================================
-- Programa local de generación de ideas / Buenas Prácticas (manual DPO,
-- pregunta 4.4 del pilar Gestión, key 1_3_4_17, id
-- 188e2345-be82-4ef5-aa05-95a3366c83d7).
--
-- Cubre el ciclo completo exigido por el auditor:
--   R4.4.1 · Programa definido para incentivar ideas de mejora (almacén /
--            entrega / flota → seguridad, calidad, productividad, capacidad).
--   R4.4.2 · Empleados de todos los niveles envían ideas desde la plataforma
--            (origen 'portal').
--   R4.4.3 · Reconocimiento / feedback al empleado + seguimiento de la
--            implementación (timeline de avances).
--   R4.4.4 · Buenas prácticas aprobadas se analizan para replicar/implementar.
--   R4.4.5 · Mejora medible en un KPI/PI por la idea implementada.
--   R4.4.6 · Mejores prácticas elevadas a Mejor Práctica de Zona/UN (12 meses).
--
-- Idempotente. Solo Pampeana (el gateo es a nivel de aplicación con IS_MISIONES;
-- esta migración solo se aplica al proyecto Supabase de Pampeana).
-- =============================================

BEGIN;

-- =============================================
-- a) Ideas / Buenas Prácticas
-- =============================================
CREATE TABLE IF NOT EXISTS bp_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Área de la operación que mejora la idea (R4.4.1)
  area TEXT NOT NULL DEFAULT 'otro',
  -- Dimensión de mejora (R4.4.1)
  categoria TEXT NOT NULL DEFAULT 'otro',

  -- Proponente (R4.4.2). autor_nombre es texto libre para cubrir empleados
  -- sin login; autor_profile_id se completa cuando lo envía un usuario logueado.
  autor_nombre TEXT NOT NULL,
  autor_area TEXT,
  autor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  origen TEXT NOT NULL DEFAULT 'gestion',   -- 'portal' (empleado) | 'gestion'

  estado TEXT NOT NULL DEFAULT 'nueva',
  -- Revisión / feedback (R4.4.3)
  comentario_revision TEXT,
  revisado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_revision TIMESTAMPTZ,
  -- Reconocimiento al empleado (R4.4.3)
  reconocido BOOLEAN NOT NULL DEFAULT false,
  reconocimiento TEXT,

  -- Impacto medible en KPI/PI (R4.4.5)
  kpi_nombre TEXT,
  kpi_unidad TEXT,
  kpi_linea_base NUMERIC,
  kpi_objetivo NUMERIC,
  kpi_logrado NUMERIC,
  kpi_comentario TEXT,

  -- Replicación (R4.4.4)
  replicable BOOLEAN NOT NULL DEFAULT false,
  replica_areas TEXT,
  replica_comentario TEXT,

  -- Elevación a Mejor Práctica de Zona/UN (R4.4.6)
  elevada_zona BOOLEAN NOT NULL DEFAULT false,
  fecha_elevacion TIMESTAMPTZ,
  elevacion_comentario TEXT,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bp_ideas_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT bp_ideas_autor_chk CHECK (btrim(autor_nombre) <> ''),
  CONSTRAINT bp_ideas_area_chk CHECK (
    area IN ('almacen', 'entrega', 'flota', 'gestion', 'seguridad', 'otro')
  ),
  CONSTRAINT bp_ideas_categoria_chk CHECK (
    categoria IN ('seguridad', 'calidad', 'productividad', 'capacidad', 'otro')
  ),
  CONSTRAINT bp_ideas_origen_chk CHECK (origen IN ('portal', 'gestion')),
  CONSTRAINT bp_ideas_estado_chk CHECK (
    estado IN ('nueva', 'en_revision', 'aprobada', 'rechazada', 'implementada', 'replicada')
  )
);

CREATE INDEX IF NOT EXISTS idx_bp_ideas_estado ON bp_ideas(estado);
CREATE INDEX IF NOT EXISTS idx_bp_ideas_area ON bp_ideas(area);
CREATE INDEX IF NOT EXISTS idx_bp_ideas_origen ON bp_ideas(origen);
CREATE INDEX IF NOT EXISTS idx_bp_ideas_autor ON bp_ideas(autor_profile_id);
CREATE INDEX IF NOT EXISTS idx_bp_ideas_created ON bp_ideas(created_at);

ALTER TABLE bp_ideas ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado.
DROP POLICY IF EXISTS "bp_ideas_select_auth" ON bp_ideas;
CREATE POLICY "bp_ideas_select_auth"
  ON bp_ideas FOR SELECT TO authenticated
  USING (true);

-- Alta: cualquier autenticado puede enviar una idea (R4.4.2 — empleados de
-- todos los niveles). La gestión posterior queda restringida a editores.
DROP POLICY IF EXISTS "bp_ideas_insert" ON bp_ideas;
CREATE POLICY "bp_ideas_insert"
  ON bp_ideas FOR INSERT TO authenticated
  WITH CHECK (true);

-- Edición (revisión, reconocimiento, KPI, replicación, elevación): editores.
DROP POLICY IF EXISTS "bp_ideas_update" ON bp_ideas;
CREATE POLICY "bp_ideas_update"
  ON bp_ideas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "bp_ideas_delete" ON bp_ideas;
CREATE POLICY "bp_ideas_delete"
  ON bp_ideas FOR DELETE TO authenticated
  USING (
    autor_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON bp_ideas TO anon, authenticated, service_role;

-- =============================================
-- b) Avances / timeline de seguimiento (R4.4.3)
--    Comentarios, cambios de estado, reconocimientos, implementación e impacto.
-- =============================================
CREATE TABLE IF NOT EXISTS bp_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES bp_ideas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'comentario',
  descripcion TEXT,
  estado_resultante TEXT,
  archivo_path TEXT,                       -- bucket 'buenas-practicas'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  autor_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bp_avances_tipo_chk CHECK (
    tipo IN ('comentario', 'cambio_estado', 'reconocimiento', 'implementacion', 'impacto')
  ),
  CONSTRAINT bp_avances_payload_chk CHECK (
    coalesce(btrim(descripcion), '') <> '' OR archivo_path IS NOT NULL
  ),
  CONSTRAINT bp_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('nueva', 'en_revision', 'aprobada', 'rechazada', 'implementada', 'replicada')
  )
);

CREATE INDEX IF NOT EXISTS idx_bp_avances_idea ON bp_avances(idea_id);
CREATE INDEX IF NOT EXISTS idx_bp_avances_created ON bp_avances(created_at);

ALTER TABLE bp_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bp_avances_select_auth" ON bp_avances;
CREATE POLICY "bp_avances_select_auth"
  ON bp_avances FOR SELECT TO authenticated
  USING (true);

-- Alta de avance: el autor de la idea (puede comentar/seguir su propia idea) o
-- un editor.
DROP POLICY IF EXISTS "bp_avances_insert" ON bp_avances;
CREATE POLICY "bp_avances_insert"
  ON bp_avances FOR INSERT TO authenticated
  WITH CHECK (
    idea_id IN (SELECT id FROM bp_ideas WHERE autor_profile_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "bp_avances_delete" ON bp_avances;
CREATE POLICY "bp_avances_delete"
  ON bp_avances FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON bp_avances TO anon, authenticated, service_role;

-- =============================================
-- c) Bucket de evidencias/adjuntos de avances
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('buenas-practicas', 'buenas-practicas', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "bp_storage_read" ON storage.objects;
CREATE POLICY "bp_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'buenas-practicas');

DROP POLICY IF EXISTS "bp_storage_insert" ON storage.objects;
CREATE POLICY "bp_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'buenas-practicas');

DROP POLICY IF EXISTS "bp_storage_delete" ON storage.objects;
CREATE POLICY "bp_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'buenas-practicas');

COMMIT;

NOTIFY pgrst, 'reload schema';
