-- =============================================================
-- APLICAR EN SUPABASE - Misiones (dpo-distribuciones)
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
--
-- Crea las tablas faltantes para los módulos:
--   - Reuniones (044, 045, 046, 048)
--   - Presupuesto (044)
--   - Registro de tareas (049)
--   - 5S sectores almacén (047)
--   - Reportes de seguridad SIF/accidente (050)
--   - Riesgos externos (050)
--
-- Idempotente: las migraciones usan IF NOT EXISTS / DROP POLICY IF EXISTS
-- excepto 047 (s5_sectores_almacen) que solo crea si la tabla no existe.
-- Si alguna migración ya se aplicó parcialmente, comentar esa sección.
-- =============================================================


-- =============================================================
-- INICIO 044_presupuesto.sql
-- =============================================================
-- =============================================
-- 044 · Presupuesto (módulo /presupuesto)
-- =============================================
-- Modelo:
--   1) presupuestos_anuales (1 archivo por año)
--   2) presupuestos_mensuales (1 archivo por (anio, mes))
--   3) presupuestos_tareas (acciones de análisis por (anio, mes, rubro))
--
-- El responsable de una tarea puede UPDATE para responderla (subir evidencia,
-- justificación, marcar completada). El resto de las mutaciones requiere
-- admin / supervisor / admin_rrhh.
-- =============================================

BEGIN;

-- =============================================
-- 1) Presupuesto anual
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_anuales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio            int  NOT NULL UNIQUE,
  archivo_url     text,
  archivo_nombre  text,
  observaciones   text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- =============================================
-- 2) Presupuesto mensual (estado del mes)
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_mensuales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio            int  NOT NULL,
  mes             int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  archivo_url     text,
  archivo_nombre  text,
  observaciones   text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_mensuales_anio_mes
  ON presupuestos_mensuales(anio, mes);


-- =============================================
-- 3) Tareas de análisis (acciones por desvío / rubro)
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_tareas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio                  int  NOT NULL,
  mes                   int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  rubro                 text NOT NULL,
  monto_presupuestado   numeric(14,2),
  monto_real            numeric(14,2),
  descripcion           text,
  responsable_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_limite          date,
  estado                text NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente','en_progreso','completada')),
  evidencia_url         text,
  evidencia_nombre      text,
  justificacion         text,
  completada_at         timestamptz,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN presupuestos_tareas.rubro IS
  'Rubro libre del análisis. Ej. "Contratación de Flota", "Combustibles", "Sueldos", etc.';

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_anio_mes
  ON presupuestos_tareas(anio, mes);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_responsable
  ON presupuestos_tareas(responsable_id);

CREATE INDEX IF NOT EXISTS idx_presupuestos_tareas_estado
  ON presupuestos_tareas(estado);


-- =============================================
-- 4) RLS
-- =============================================
ALTER TABLE presupuestos_anuales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos_tareas    ENABLE ROW LEVEL SECURITY;

-- ---- presupuestos_anuales ----
DROP POLICY IF EXISTS "presupuestos_anuales_select_auth" ON presupuestos_anuales;
CREATE POLICY "presupuestos_anuales_select_auth"
  ON presupuestos_anuales FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presupuestos_anuales_write_editors" ON presupuestos_anuales;
CREATE POLICY "presupuestos_anuales_write_editors"
  ON presupuestos_anuales FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- presupuestos_mensuales ----
DROP POLICY IF EXISTS "presupuestos_mensuales_select_auth" ON presupuestos_mensuales;
CREATE POLICY "presupuestos_mensuales_select_auth"
  ON presupuestos_mensuales FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presupuestos_mensuales_write_editors" ON presupuestos_mensuales;
CREATE POLICY "presupuestos_mensuales_write_editors"
  ON presupuestos_mensuales FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- presupuestos_tareas ----
DROP POLICY IF EXISTS "presupuestos_tareas_select_auth" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_select_auth"
  ON presupuestos_tareas FOR SELECT TO authenticated
  USING (true);

-- INSERT: solo editores
DROP POLICY IF EXISTS "presupuestos_tareas_insert_editors" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_insert_editors"
  ON presupuestos_tareas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE general: editores
DROP POLICY IF EXISTS "presupuestos_tareas_update_editors" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_update_editors"
  ON presupuestos_tareas FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE responsable: el dueño de la tarea puede actualizarla (responder)
DROP POLICY IF EXISTS "presupuestos_tareas_update_responsable" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_update_responsable"
  ON presupuestos_tareas FOR UPDATE TO authenticated
  USING (responsable_id = auth.uid())
  WITH CHECK (responsable_id = auth.uid());

-- DELETE: solo editores
DROP POLICY IF EXISTS "presupuestos_tareas_delete_editors" ON presupuestos_tareas;
CREATE POLICY "presupuestos_tareas_delete_editors"
  ON presupuestos_tareas FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );


-- =============================================
-- 5) GRANTs explícitos (cache PostgREST)
-- =============================================
GRANT ALL ON presupuestos_anuales   TO anon, authenticated, service_role;
GRANT ALL ON presupuestos_mensuales TO anon, authenticated, service_role;
GRANT ALL ON presupuestos_tareas    TO anon, authenticated, service_role;


-- =============================================
-- 6) Triggers updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_presupuestos_anuales_updated_at ON presupuestos_anuales;
CREATE TRIGGER trg_presupuestos_anuales_updated_at
  BEFORE UPDATE ON presupuestos_anuales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_presupuestos_mensuales_updated_at ON presupuestos_mensuales;
CREATE TRIGGER trg_presupuestos_mensuales_updated_at
  BEFORE UPDATE ON presupuestos_mensuales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_presupuestos_tareas_updated_at ON presupuestos_tareas;
CREATE TRIGGER trg_presupuestos_tareas_updated_at
  BEFORE UPDATE ON presupuestos_tareas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================
-- 7) Storage bucket privado
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('presupuestos', 'presupuestos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "presupuestos_storage_read" ON storage.objects;
CREATE POLICY "presupuestos_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'presupuestos');

DROP POLICY IF EXISTS "presupuestos_storage_insert" ON storage.objects;
CREATE POLICY "presupuestos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'presupuestos'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "presupuestos_storage_delete" ON storage.objects;
CREATE POLICY "presupuestos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'presupuestos'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';

-- FIN 044_presupuesto.sql


-- =============================================================
-- INICIO 045_reuniones.sql
-- =============================================================
-- =============================================
-- 045 · Reuniones (módulo /reuniones)
-- =============================================
-- Modelo:
--   1) reuniones_tipos_config   (4 tipos preconfigurados con días permitidos)
--   2) reuniones_participantes_fijos  (lista por tipo, admin la carga)
--   3) reuniones                 (UNIQUE (tipo, fecha))
--   4) reuniones_asistentes      (auto-generados desde participantes_fijos al crear)
--   5) reuniones_compromisos     (acciones derivadas, evidencia, responsable)
--   6) reuniones_archivos        (adjuntos opcionales de la reunión)
--
-- El responsable de un compromiso puede UPDATE para responderlo (subir
-- evidencia, observaciones, marcar completado). El resto de las mutaciones
-- requiere admin / supervisor / admin_rrhh.
-- =============================================

BEGIN;

-- =============================================
-- 1) Configuración por tipo de reunión
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_tipos_config (
  tipo         text PRIMARY KEY
                 CHECK (tipo IN ('logistica','logistica-ventas','matinal-distribucion','warehouse')),
  nombre       text NOT NULL,
  dias_semana  int[] NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reuniones_tipos_config.dias_semana IS
  'ISO 8601 weekday numbers (1=lun, 2=mar, ..., 7=dom)';


-- =============================================
-- 2) Participantes fijos por tipo
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_participantes_fijos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL REFERENCES reuniones_tipos_config(tipo) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_reuniones_participantes_fijos_tipo
  ON reuniones_participantes_fijos(tipo);


-- =============================================
-- 3) Reuniones (1 por tipo por día)
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL REFERENCES reuniones_tipos_config(tipo) ON DELETE RESTRICT,
  fecha        date NOT NULL,
  hora_inicio  time,
  hora_fin     time,
  lugar        text,
  agenda       text,
  notas        text,
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, fecha)
);

CREATE INDEX IF NOT EXISTS idx_reuniones_tipo_fecha
  ON reuniones(tipo, fecha DESC);


-- =============================================
-- 4) Asistentes (auto-generados al crear reunión)
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_asistentes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id     uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  profile_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  presente       boolean NOT NULL DEFAULT false,
  justificacion  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reunion_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_reuniones_asistentes_reunion
  ON reuniones_asistentes(reunion_id);


-- =============================================
-- 5) Compromisos (acciones / responsables)
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_compromisos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id        uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  descripcion       text NOT NULL,
  responsable_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_compromiso  date,
  estado            text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','en_progreso','completado')),
  evidencia_url     text,
  evidencia_nombre  text,
  observaciones     text,
  completado_at     timestamptz,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reuniones_compromisos_reunion
  ON reuniones_compromisos(reunion_id);

CREATE INDEX IF NOT EXISTS idx_reuniones_compromisos_responsable
  ON reuniones_compromisos(responsable_id);

CREATE INDEX IF NOT EXISTS idx_reuniones_compromisos_estado
  ON reuniones_compromisos(estado);


-- =============================================
-- 6) Archivos de la reunión
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_archivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id      uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  archivo_url     text NOT NULL,
  archivo_nombre  text NOT NULL,
  descripcion     text,
  uploaded_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reuniones_archivos_reunion
  ON reuniones_archivos(reunion_id);


-- =============================================
-- 7) Precarga de tipos (idempotente)
-- =============================================
INSERT INTO reuniones_tipos_config (tipo, nombre, dias_semana) VALUES
  ('logistica',            'Reunión de Logística',     ARRAY[1,2,3,4,5]),
  ('matinal-distribucion', 'Matinal Distribución',     ARRAY[1,2,3,4,5]),
  ('warehouse',            'Reunión Warehouse',        ARRAY[1,2,3,4,5]),
  ('logistica-ventas',     'Reunión Logística-Ventas', ARRAY[2])
ON CONFLICT (tipo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      dias_semana = EXCLUDED.dias_semana;


-- =============================================
-- 8) RLS
-- =============================================
ALTER TABLE reuniones_tipos_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones_participantes_fijos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones_asistentes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones_compromisos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones_archivos             ENABLE ROW LEVEL SECURITY;

-- ---- reuniones_tipos_config ----
DROP POLICY IF EXISTS "reuniones_tipos_config_select_auth" ON reuniones_tipos_config;
CREATE POLICY "reuniones_tipos_config_select_auth"
  ON reuniones_tipos_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reuniones_tipos_config_write_editors" ON reuniones_tipos_config;
CREATE POLICY "reuniones_tipos_config_write_editors"
  ON reuniones_tipos_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- reuniones_participantes_fijos ----
DROP POLICY IF EXISTS "reuniones_participantes_fijos_select_auth" ON reuniones_participantes_fijos;
CREATE POLICY "reuniones_participantes_fijos_select_auth"
  ON reuniones_participantes_fijos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reuniones_participantes_fijos_write_editors" ON reuniones_participantes_fijos;
CREATE POLICY "reuniones_participantes_fijos_write_editors"
  ON reuniones_participantes_fijos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- reuniones ----
DROP POLICY IF EXISTS "reuniones_select_auth" ON reuniones;
CREATE POLICY "reuniones_select_auth"
  ON reuniones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reuniones_write_editors" ON reuniones;
CREATE POLICY "reuniones_write_editors"
  ON reuniones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- reuniones_asistentes ----
DROP POLICY IF EXISTS "reuniones_asistentes_select_auth" ON reuniones_asistentes;
CREATE POLICY "reuniones_asistentes_select_auth"
  ON reuniones_asistentes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reuniones_asistentes_write_editors" ON reuniones_asistentes;
CREATE POLICY "reuniones_asistentes_write_editors"
  ON reuniones_asistentes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- reuniones_compromisos ----
DROP POLICY IF EXISTS "reuniones_compromisos_select_auth" ON reuniones_compromisos;
CREATE POLICY "reuniones_compromisos_select_auth"
  ON reuniones_compromisos FOR SELECT TO authenticated
  USING (true);

-- INSERT: solo editores
DROP POLICY IF EXISTS "reuniones_compromisos_insert_editors" ON reuniones_compromisos;
CREATE POLICY "reuniones_compromisos_insert_editors"
  ON reuniones_compromisos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE general: editores
DROP POLICY IF EXISTS "reuniones_compromisos_update_editors" ON reuniones_compromisos;
CREATE POLICY "reuniones_compromisos_update_editors"
  ON reuniones_compromisos FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE responsable: el dueño del compromiso puede actualizarlo (responder)
DROP POLICY IF EXISTS "reuniones_compromisos_update_responsable" ON reuniones_compromisos;
CREATE POLICY "reuniones_compromisos_update_responsable"
  ON reuniones_compromisos FOR UPDATE TO authenticated
  USING (responsable_id = auth.uid())
  WITH CHECK (responsable_id = auth.uid());

-- DELETE: solo editores
DROP POLICY IF EXISTS "reuniones_compromisos_delete_editors" ON reuniones_compromisos;
CREATE POLICY "reuniones_compromisos_delete_editors"
  ON reuniones_compromisos FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- reuniones_archivos ----
DROP POLICY IF EXISTS "reuniones_archivos_select_auth" ON reuniones_archivos;
CREATE POLICY "reuniones_archivos_select_auth"
  ON reuniones_archivos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reuniones_archivos_write_editors" ON reuniones_archivos;
CREATE POLICY "reuniones_archivos_write_editors"
  ON reuniones_archivos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );


-- =============================================
-- 9) GRANTs explícitos (cache PostgREST)
-- =============================================
GRANT ALL ON reuniones_tipos_config        TO anon, authenticated, service_role;
GRANT ALL ON reuniones_participantes_fijos TO anon, authenticated, service_role;
GRANT ALL ON reuniones                     TO anon, authenticated, service_role;
GRANT ALL ON reuniones_asistentes          TO anon, authenticated, service_role;
GRANT ALL ON reuniones_compromisos         TO anon, authenticated, service_role;
GRANT ALL ON reuniones_archivos            TO anon, authenticated, service_role;


-- =============================================
-- 10) Triggers updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_reuniones_tipos_config_updated_at ON reuniones_tipos_config;
CREATE TRIGGER trg_reuniones_tipos_config_updated_at
  BEFORE UPDATE ON reuniones_tipos_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_reuniones_updated_at ON reuniones;
CREATE TRIGGER trg_reuniones_updated_at
  BEFORE UPDATE ON reuniones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_reuniones_compromisos_updated_at ON reuniones_compromisos;
CREATE TRIGGER trg_reuniones_compromisos_updated_at
  BEFORE UPDATE ON reuniones_compromisos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================
-- 11) Storage bucket privado
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('reuniones', 'reuniones', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "reuniones_storage_read" ON storage.objects;
CREATE POLICY "reuniones_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reuniones');

DROP POLICY IF EXISTS "reuniones_storage_insert" ON storage.objects;
CREATE POLICY "reuniones_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reuniones'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "reuniones_storage_delete" ON storage.objects;
CREATE POLICY "reuniones_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reuniones'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';

-- FIN 045_reuniones.sql


-- =============================================================
-- INICIO 046_reuniones_v3.sql
-- =============================================================
-- =============================================
-- 046 · Reuniones v3
-- =============================================
-- Cambios respecto a 045:
--   a) Renombre reuniones_compromisos -> reuniones_actividades
--      (incluye índices, triggers y policies)
--   b) Estados nuevos: no_comenzada / en_curso / cerrada
--      (migra valores viejos: pendiente, en_progreso, completado)
--   c) Columna nueva: motivo (text, nullable)
--   d) Tablas nuevas: reuniones_indicadores_config y
--      reuniones_indicadores_valores (con RLS, GRANTs y triggers)
--   e) Precarga 3 indicadores dummy por cada uno de los 4 tipos
--   f) Policy adicional UPDATE en reuniones_asistentes para self-asistencia
--
-- Idempotente. Reload de schema cache PostgREST al final, fuera de COMMIT.
-- =============================================

BEGIN;

-- =============================================
-- a) Renombrar reuniones_compromisos -> reuniones_actividades
-- =============================================
ALTER TABLE IF EXISTS reuniones_compromisos RENAME TO reuniones_actividades;

-- Renombrar índices
ALTER INDEX IF EXISTS idx_reuniones_compromisos_reunion
  RENAME TO idx_reuniones_actividades_reunion;
ALTER INDEX IF EXISTS idx_reuniones_compromisos_responsable
  RENAME TO idx_reuniones_actividades_responsable;
ALTER INDEX IF EXISTS idx_reuniones_compromisos_estado
  RENAME TO idx_reuniones_actividades_estado;

-- Renombrar trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_reuniones_compromisos_updated_at'
  ) THEN
    ALTER TRIGGER trg_reuniones_compromisos_updated_at
      ON reuniones_actividades
      RENAME TO trg_reuniones_actividades_updated_at;
  END IF;
END $$;

-- Asegurar trigger updated_at (idempotente)
DROP TRIGGER IF EXISTS trg_reuniones_actividades_updated_at ON reuniones_actividades;
CREATE TRIGGER trg_reuniones_actividades_updated_at
  BEFORE UPDATE ON reuniones_actividades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- b) Estados nuevos
-- =============================================
ALTER TABLE reuniones_actividades
  DROP CONSTRAINT IF EXISTS reuniones_compromisos_estado_check;
ALTER TABLE reuniones_actividades
  DROP CONSTRAINT IF EXISTS reuniones_actividades_estado_check;

-- Migrar datos viejos (idempotente)
UPDATE reuniones_actividades SET estado = 'no_comenzada' WHERE estado = 'pendiente';
UPDATE reuniones_actividades SET estado = 'en_curso'     WHERE estado = 'en_progreso';
UPDATE reuniones_actividades SET estado = 'cerrada'      WHERE estado = 'completado';

ALTER TABLE reuniones_actividades
  ADD CONSTRAINT reuniones_actividades_estado_check
  CHECK (estado IN ('no_comenzada','en_curso','cerrada'));

ALTER TABLE reuniones_actividades
  ALTER COLUMN estado SET DEFAULT 'no_comenzada';

-- =============================================
-- c) Columna motivo
-- =============================================
ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS motivo text;

-- =============================================
-- Recrear policies con el nuevo nombre
-- =============================================
-- Drop antiguas (si quedaron del 045)
DROP POLICY IF EXISTS "reuniones_compromisos_select_auth"        ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_compromisos_insert_editors"     ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_compromisos_update_editors"     ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_compromisos_update_responsable" ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_compromisos_delete_editors"     ON reuniones_actividades;

-- Drop nuevas (idempotente)
DROP POLICY IF EXISTS "reuniones_actividades_select_auth"        ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_actividades_insert_editors"     ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_actividades_update_editors"     ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_actividades_update_responsable" ON reuniones_actividades;
DROP POLICY IF EXISTS "reuniones_actividades_delete_editors"     ON reuniones_actividades;

ALTER TABLE reuniones_actividades ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier authenticated
CREATE POLICY "reuniones_actividades_select_auth"
  ON reuniones_actividades FOR SELECT TO authenticated
  USING (true);

-- INSERT: editores
CREATE POLICY "reuniones_actividades_insert_editors"
  ON reuniones_actividades FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE general: editores
CREATE POLICY "reuniones_actividades_update_editors"
  ON reuniones_actividades FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- UPDATE responsable: el dueño puede responderla
CREATE POLICY "reuniones_actividades_update_responsable"
  ON reuniones_actividades FOR UPDATE TO authenticated
  USING (responsable_id = auth.uid())
  WITH CHECK (responsable_id = auth.uid());

-- DELETE: editores
CREATE POLICY "reuniones_actividades_delete_editors"
  ON reuniones_actividades FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- GRANT explícito (cache PostgREST)
GRANT ALL ON reuniones_actividades TO anon, authenticated, service_role;


-- =============================================
-- d) Tablas nuevas: indicadores config + valores
-- =============================================
CREATE TABLE IF NOT EXISTS reuniones_indicadores_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL REFERENCES reuniones_tipos_config(tipo) ON DELETE CASCADE,
  nombre       text NOT NULL,
  unidad       text,
  meta         numeric(14,2),
  orden        int NOT NULL DEFAULT 0,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reuniones_indicadores_config_tipo
  ON reuniones_indicadores_config(tipo);

CREATE TABLE IF NOT EXISTS reuniones_indicadores_valores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id      uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  indicador_id    uuid NOT NULL REFERENCES reuniones_indicadores_config(id) ON DELETE CASCADE,
  valor           numeric(14,2),
  observacion     text,
  registrado_por  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reunion_id, indicador_id)
);

CREATE INDEX IF NOT EXISTS idx_reuniones_indicadores_valores_reunion
  ON reuniones_indicadores_valores(reunion_id);

-- RLS
ALTER TABLE reuniones_indicadores_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones_indicadores_valores ENABLE ROW LEVEL SECURITY;

-- ---- reuniones_indicadores_config ----
DROP POLICY IF EXISTS "reuniones_indicadores_config_select_auth" ON reuniones_indicadores_config;
CREATE POLICY "reuniones_indicadores_config_select_auth"
  ON reuniones_indicadores_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reuniones_indicadores_config_write_editors" ON reuniones_indicadores_config;
CREATE POLICY "reuniones_indicadores_config_write_editors"
  ON reuniones_indicadores_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- ---- reuniones_indicadores_valores ----
DROP POLICY IF EXISTS "reuniones_indicadores_valores_select_auth" ON reuniones_indicadores_valores;
CREATE POLICY "reuniones_indicadores_valores_select_auth"
  ON reuniones_indicadores_valores FOR SELECT TO authenticated
  USING (true);

-- INSERT: editores o el propio user que registra
DROP POLICY IF EXISTS "reuniones_indicadores_valores_insert" ON reuniones_indicadores_valores;
CREATE POLICY "reuniones_indicadores_valores_insert"
  ON reuniones_indicadores_valores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
    OR registrado_por = auth.uid()
  );

-- UPDATE: editores o el propio user que registró
DROP POLICY IF EXISTS "reuniones_indicadores_valores_update" ON reuniones_indicadores_valores;
CREATE POLICY "reuniones_indicadores_valores_update"
  ON reuniones_indicadores_valores FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
    OR registrado_por = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
    OR registrado_por = auth.uid()
  );

-- DELETE: editores o el propio user que registró
DROP POLICY IF EXISTS "reuniones_indicadores_valores_delete" ON reuniones_indicadores_valores;
CREATE POLICY "reuniones_indicadores_valores_delete"
  ON reuniones_indicadores_valores FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
    OR registrado_por = auth.uid()
  );

-- GRANTs explícitos
GRANT ALL ON reuniones_indicadores_config  TO anon, authenticated, service_role;
GRANT ALL ON reuniones_indicadores_valores TO anon, authenticated, service_role;

-- Triggers updated_at
DROP TRIGGER IF EXISTS trg_reuniones_indicadores_config_updated_at ON reuniones_indicadores_config;
CREATE TRIGGER trg_reuniones_indicadores_config_updated_at
  BEFORE UPDATE ON reuniones_indicadores_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_reuniones_indicadores_valores_updated_at ON reuniones_indicadores_valores;
CREATE TRIGGER trg_reuniones_indicadores_valores_updated_at
  BEFORE UPDATE ON reuniones_indicadores_valores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================
-- e) DUMMY indicadores: 3 por tipo
-- =============================================
-- ON CONFLICT DO NOTHING no aplica (no hay UNIQUE natural). Para idempotencia
-- usamos NOT EXISTS por (tipo, nombre).
INSERT INTO reuniones_indicadores_config (tipo, nombre, unidad, meta, orden, activo)
SELECT v.tipo, v.nombre, v.unidad, v.meta, v.orden, true
FROM (VALUES
  ('logistica',            'Indicador 1 (dummy)', '%',   100::numeric, 10),
  ('logistica',            'Indicador 2 (dummy)', 'hs',  8::numeric,   20),
  ('logistica',            'Indicador 3 (dummy)', 'pts', NULL::numeric,30),
  ('logistica-ventas',     'Indicador 1 (dummy)', '%',   100::numeric, 10),
  ('logistica-ventas',     'Indicador 2 (dummy)', 'pts', NULL::numeric,20),
  ('logistica-ventas',     'Indicador 3 (dummy)', 'pts', NULL::numeric,30),
  ('matinal-distribucion', 'Indicador 1 (dummy)', '%',   100::numeric, 10),
  ('matinal-distribucion', 'Indicador 2 (dummy)', 'pts', NULL::numeric,20),
  ('matinal-distribucion', 'Indicador 3 (dummy)', 'pts', NULL::numeric,30),
  ('warehouse',            'Indicador 1 (dummy)', '%',   100::numeric, 10),
  ('warehouse',            'Indicador 2 (dummy)', 'pts', NULL::numeric,20),
  ('warehouse',            'Indicador 3 (dummy)', 'pts', NULL::numeric,30)
) AS v(tipo, nombre, unidad, meta, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_indicadores_config c
  WHERE c.tipo = v.tipo AND c.nombre = v.nombre
);


-- =============================================
-- f) Self-asistencia (policy UPDATE en asistentes)
-- =============================================
DROP POLICY IF EXISTS "reuniones_asistentes_update_self" ON reuniones_asistentes;
CREATE POLICY "reuniones_asistentes_update_self"
  ON reuniones_asistentes FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


COMMIT;

-- =============================================
-- g) Reload schema cache de PostgREST (fuera de transacción)
-- =============================================
NOTIFY pgrst, 'reload schema';

-- FIN 046_reuniones_v3.sql


-- =============================================================
-- INICIO 047_s5_sectores_almacen.sql
-- =============================================================
-- =============================================
-- 5S: catálogo persistente de sectores de almacén
-- Reemplaza el uso de s5_sector_responsables.nombre
-- (ese campo se reseteaba mes a mes).
-- =============================================

CREATE TABLE s5_sectores_almacen (
  numero INT PRIMARY KEY CHECK (numero BETWEEN 1 AND 4),
  nombre TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_s5_sectores_almacen_updated_at
  BEFORE UPDATE ON s5_sectores_almacen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_sectores_almacen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_sectores_almacen_read"
  ON s5_sectores_almacen FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_sectores_almacen_update"
  ON s5_sectores_almacen FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','auditor')
    )
  );

INSERT INTO s5_sectores_almacen (numero, nombre) VALUES
  (1, 'Almacén'),
  (2, 'Picking/Stay'),
  (3, 'Nave'),
  (4, 'Espacios externos');

-- FIN 047_s5_sectores_almacen.sql


-- =============================================================
-- INICIO 048_reuniones_v5_indicadores_mes.sql
-- =============================================================
-- =============================================
-- 047 · Reuniones v5 · Indicadores: agregación mensual
-- =============================================
-- Cambios respecto a 046:
--   a) Agrega columna `agregacion` a reuniones_indicadores_config
--      ('suma' | 'promedio'), default 'promedio'.
--   b) Borra los 3 indicadores dummy de tipo 'logistica' (los otros tipos
--      conservan sus dummies por ahora).
--   c) Inserta 15 indicadores reales de logística con su unidad, orden y
--      agregación. Targets en NULL (admin los carga después).
--
-- Idempotente. Reload de schema cache PostgREST al final, fuera de COMMIT.
-- =============================================

BEGIN;

-- =============================================
-- a) Columna agregacion
-- =============================================
ALTER TABLE reuniones_indicadores_config
  ADD COLUMN IF NOT EXISTS agregacion text NOT NULL DEFAULT 'promedio'
  CHECK (agregacion IN ('suma', 'promedio'));

-- =============================================
-- b) Borrar dummies de logística
-- =============================================
-- ON DELETE CASCADE en reuniones_indicadores_valores hace cleanup automático.
DELETE FROM reuniones_indicadores_config
WHERE tipo = 'logistica' AND nombre LIKE 'Indicador % (dummy)';

-- =============================================
-- c) Insertar 15 indicadores reales de logística
-- =============================================
-- Idempotente con NOT EXISTS por (tipo, nombre).
INSERT INTO reuniones_indicadores_config (tipo, nombre, unidad, meta, orden, activo, agregacion)
SELECT 'logistica', v.nombre, v.unidad, NULL::numeric, v.orden, true, v.agregacion
FROM (VALUES
  ('LTI',                       'cant.',   10, 'suma'),
  ('TRI',                       'cant.',   20, 'suma'),
  ('Ausentismo',                '%',       30, 'promedio'),
  ('Bultos totales',            'bultos',  40, 'suma'),
  ('Cantidad de camiones',      'u.',      50, 'promedio'),
  ('Rechazo',                   '%',       60, 'promedio'),
  ('TML',                       'min',     70, 'promedio'),
  ('TLP',                       'min',     80, 'promedio'),
  ('Driver Click Score',        'pts',     90, 'promedio'),
  ('Tiempo en ruta',            'hs',     100, 'promedio'),
  ('Productividad de picking',  'bul/hr', 110, 'promedio'),
  ('WNP',                       '%',      120, 'promedio'),
  ('Faltantes',                 'cant.',  130, 'suma'),
  ('Roturas',                   'cant.',  140, 'suma'),
  ('WQI',                       '%',      150, 'promedio')
) AS v(nombre, unidad, orden, agregacion)
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_indicadores_config c
  WHERE c.tipo = 'logistica' AND c.nombre = v.nombre
);

COMMIT;

-- =============================================
-- d) Reload schema cache de PostgREST (fuera de transacción)
-- =============================================
NOTIFY pgrst, 'reload schema';

-- FIN 048_reuniones_v5_indicadores_mes.sql


-- =============================================================
-- INICIO 049_tareas_directas.sql
-- =============================================================
-- =============================================
-- 049 · Tareas directas
-- =============================================
-- Permite crear "tareas" sin pasar por una auditoría.
-- Reusa planes_accion + plan_responsables (M2M).
--
-- Cambios:
--   a) planes_accion.pregunta_id → nullable (tarea directa puede no estar
--      asociada a un punto del manual al crearla; se asocia después).
--   b) planes_accion.tipo enum ('auditoria' | 'directa') default 'auditoria'.
--   c) planes_accion.titulo text nullable (título corto para tareas
--      directas; las de auditoría siguen mostrando el texto de la pregunta).
--   d) profiles.puede_asignar_tareas boolean default false.
--      Activar manualmente (UI admin) para los 5 supervisores autorizados.
--   e) Ampliar policies de INSERT/UPDATE de planes_accion y de
--      write de plan_responsables para incluir profiles con
--      puede_asignar_tareas = true.
--   f) Index en planes_accion(tipo).
--
-- Idempotente. Reload de schema cache PostgREST al final, fuera de COMMIT.
-- =============================================

BEGIN;

-- =============================================
-- a) pregunta_id → nullable (en planes_accion y evidencias)
-- =============================================
ALTER TABLE planes_accion
  ALTER COLUMN pregunta_id DROP NOT NULL;

-- Las evidencias subidas en una tarea directa sin punto asociado
-- también deben poder existir sin pregunta_id (se vinculan al plan
-- vía evidencia_planes; la trazabilidad al manual se da cuando el
-- creador asocia el punto al plan).
ALTER TABLE evidencias
  ALTER COLUMN pregunta_id DROP NOT NULL;

-- =============================================
-- b) Enum tipo + columna
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_tipo') THEN
    CREATE TYPE plan_tipo AS ENUM ('auditoria', 'directa');
  END IF;
END$$;

ALTER TABLE planes_accion
  ADD COLUMN IF NOT EXISTS tipo plan_tipo NOT NULL DEFAULT 'auditoria';

-- =============================================
-- c) Título corto (para tareas directas)
-- =============================================
ALTER TABLE planes_accion
  ADD COLUMN IF NOT EXISTS titulo TEXT;

-- =============================================
-- d) Flag de creador en profiles
-- =============================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS puede_asignar_tareas BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================
-- e) Policies — ampliar para incluir puede_asignar_tareas
-- =============================================

-- planes_accion INSERT
DROP POLICY IF EXISTS "Admin and auditor can insert planes_accion" ON planes_accion;
DROP POLICY IF EXISTS "planes_accion_insert_creators" ON planes_accion;

CREATE POLICY "planes_accion_insert_creators"
  ON planes_accion FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (role IN ('admin', 'auditor') OR puede_asignar_tareas = TRUE)
    )
  );

-- planes_accion UPDATE (admin/auditor + puede_asignar_tareas)
DROP POLICY IF EXISTS "Admin and auditor can update planes_accion" ON planes_accion;
DROP POLICY IF EXISTS "planes_accion_update_creators" ON planes_accion;

CREATE POLICY "planes_accion_update_creators"
  ON planes_accion FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (role IN ('admin', 'auditor') OR puede_asignar_tareas = TRUE)
    )
  );
-- Nota: la policy "planes_accion_responsable_update" de la migración 035
-- sigue activa y permite a los responsables editar progreso/notas/estado.

-- plan_responsables write
DROP POLICY IF EXISTS "plan_responsables_write_admin" ON plan_responsables;
DROP POLICY IF EXISTS "plan_responsables_write_creators" ON plan_responsables;

CREATE POLICY "plan_responsables_write_creators"
  ON plan_responsables FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (role IN ('admin', 'auditor') OR puede_asignar_tareas = TRUE)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (role IN ('admin', 'auditor') OR puede_asignar_tareas = TRUE)
    )
  );

-- =============================================
-- f) Index
-- =============================================
CREATE INDEX IF NOT EXISTS idx_planes_accion_tipo ON planes_accion(tipo);

COMMIT;

-- Reload PostgREST schema cache (fuera de COMMIT)
NOTIFY pgrst, 'reload schema';

-- FIN 049_tareas_directas.sql


-- =============================================================
-- INICIO 050_reportes_seguridad_tipo_sif_accidente.sql
-- =============================================================
-- =============================================
-- Reportes de Seguridad: tipo_sif + tipo_accidente
-- =============================================
-- Reemplaza el booleano `sif` por dos campos categorizados:
--   tipo_sif        : sif_actual / sif_potencial / sif_precursor
--   tipo_accidente  : fat / lti / mti / fai / sio / sho
-- Mantenemos la columna `sif` (boolean) para no perder histórico.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reporte_seguridad_tipo_sif') THEN
    CREATE TYPE reporte_seguridad_tipo_sif AS ENUM (
      'sif_actual',
      'sif_potencial',
      'sif_precursor'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reporte_seguridad_tipo_accidente') THEN
    CREATE TYPE reporte_seguridad_tipo_accidente AS ENUM (
      'fat',
      'lti',
      'mti',
      'fai',
      'sio',
      'sho'
    );
  END IF;
END $$;

ALTER TABLE reportes_seguridad
  ADD COLUMN IF NOT EXISTS tipo_sif reporte_seguridad_tipo_sif,
  ADD COLUMN IF NOT EXISTS tipo_accidente reporte_seguridad_tipo_accidente;

CREATE INDEX IF NOT EXISTS idx_reportes_seguridad_tipo_sif
  ON reportes_seguridad(tipo_sif);
CREATE INDEX IF NOT EXISTS idx_reportes_seguridad_tipo_accidente
  ON reportes_seguridad(tipo_accidente);

-- FIN 050_reportes_seguridad_tipo_sif_accidente.sql


-- =============================================================
-- INICIO 050_riesgos_externos.sql
-- =============================================================
-- =============================================
-- 050 · Riesgos Externos — Plan de Acción
-- =============================================
-- Pilar Planeamiento, punto 2.2 (Evaluación de riesgos, respuesta y
-- reanudación del negocio). Bitácora de sucesos: cada fila es un evento
-- de riesgo externo con su tratamiento. Tipos de riesgo derivados de la
-- "Presentación Riesgo Externo 2026" + Matriz de Riesgo del CD.
-- =============================================

BEGIN;

-- =============================================
-- 1) Enums
-- =============================================
DO $$ BEGIN
  CREATE TYPE tipo_riesgo_externo AS ENUM (
    'corte_de_luz',
    'falla_en_generador',
    'corte_de_sistema',
    'corte_de_internet',
    'corte_de_ruta_o_acceso',
    'incendio',
    'paro_sindical',
    'emergencia_medica_interna',
    'emergencia_medica_externa',
    'temporal',
    'robo_warehouse',
    'robo_distribucion',
    'saqueos',
    'clausura_del_predio',
    'no_apertura_de_caja',
    'amenaza_de_bomba',
    'pandemia',
    'invasion_de_plagas'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_riesgo_externo AS ENUM (
    'no_iniciado',
    'en_curso',
    'concluido',
    'concluido_con_atraso',
    'atrasado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================
-- 2) Tabla principal
-- =============================================
CREATE SEQUENCE IF NOT EXISTS riesgos_externos_acciones_nro_seq START 1;

CREATE TABLE IF NOT EXISTS riesgos_externos_acciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_correlativo      int  NOT NULL UNIQUE
                         DEFAULT nextval('riesgos_externos_acciones_nro_seq'),
  tipo_riesgo          tipo_riesgo_externo NOT NULL,
  observaciones        text NOT NULL,
  resolucion           text,
  fecha_ocurrencia     date NOT NULL,
  responsable_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tarea_pendiente      text,
  fecha_compromiso     date,
  fecha_cierre_real    date,
  estado               estado_riesgo_externo NOT NULL DEFAULT 'no_iniciado',
  semana               int  GENERATED ALWAYS AS
                         (EXTRACT(WEEK FROM fecha_ocurrencia)::int) STORED,
  created_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE riesgos_externos_acciones_nro_seq
  OWNED BY riesgos_externos_acciones.nro_correlativo;

CREATE INDEX IF NOT EXISTS idx_riesgos_ext_fecha
  ON riesgos_externos_acciones(fecha_ocurrencia DESC);
CREATE INDEX IF NOT EXISTS idx_riesgos_ext_estado
  ON riesgos_externos_acciones(estado);
CREATE INDEX IF NOT EXISTS idx_riesgos_ext_tipo
  ON riesgos_externos_acciones(tipo_riesgo);
CREATE INDEX IF NOT EXISTS idx_riesgos_ext_responsable
  ON riesgos_externos_acciones(responsable_id);


-- =============================================
-- 3) RLS
-- =============================================
ALTER TABLE riesgos_externos_acciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "riesgos_ext_select_auth" ON riesgos_externos_acciones;
CREATE POLICY "riesgos_ext_select_auth"
  ON riesgos_externos_acciones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "riesgos_ext_write_editors" ON riesgos_externos_acciones;
CREATE POLICY "riesgos_ext_write_editors"
  ON riesgos_externos_acciones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );


-- =============================================
-- 4) Trigger updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_riesgos_ext_updated_at ON riesgos_externos_acciones;
CREATE TRIGGER trg_riesgos_ext_updated_at
  BEFORE UPDATE ON riesgos_externos_acciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

-- FIN 050_riesgos_externos.sql

