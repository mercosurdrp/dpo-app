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
