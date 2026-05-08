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
