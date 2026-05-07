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
