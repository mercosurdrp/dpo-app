-- =============================================
-- 132 · Buenas Prácticas · Plan de implementación (qué hacer + ejecución)
-- =============================================
-- Pasos accionables para llevar a cabo una buena práctica aprobada: el "qué
-- hacer" (descripción), responsable, fecha límite y estado de ejecución
-- (pendiente → en curso → hecho). Cierra el ciclo entre la idea aprobada y el
-- impacto medible en KPI (R4.4.3 seguimiento de la implementación, R4.4.5).
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS bp_acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID NOT NULL REFERENCES bp_ideas(id) ON DELETE CASCADE,
  que_hacer TEXT NOT NULL,                 -- la acción concreta a ejecutar
  responsable TEXT,
  fecha_limite DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  completado_at TIMESTAMPTZ,
  orden INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bp_acciones_quehacer_chk CHECK (btrim(que_hacer) <> ''),
  CONSTRAINT bp_acciones_estado_chk CHECK (
    estado IN ('pendiente', 'en_curso', 'hecho')
  )
);

CREATE INDEX IF NOT EXISTS idx_bp_acciones_idea ON bp_acciones(idea_id);
CREATE INDEX IF NOT EXISTS idx_bp_acciones_estado ON bp_acciones(estado);

ALTER TABLE bp_acciones ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier autenticado (el empleado autor puede ver el plan de su idea).
DROP POLICY IF EXISTS "bp_acciones_select_auth" ON bp_acciones;
CREATE POLICY "bp_acciones_select_auth"
  ON bp_acciones FOR SELECT TO authenticated
  USING (true);

-- Gestión del plan: editores.
DROP POLICY IF EXISTS "bp_acciones_write" ON bp_acciones;
CREATE POLICY "bp_acciones_write"
  ON bp_acciones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

GRANT ALL ON bp_acciones TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
