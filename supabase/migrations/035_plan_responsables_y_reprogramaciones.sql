-- =============================================
-- Cluster A: Plan de Acción tipo Teams
-- - Responsables múltiples (M2M plan ↔ profile, con rol)
-- - Log de reprogramaciones
-- - Flag evidencia obligatoria + motivo de cierre sin evidencia
-- - RLS para "Mis tareas" (responsable ve y edita sus planes)
-- =============================================

CREATE TYPE plan_responsable_rol AS ENUM ('responsable_principal', 'coresponsable');

-- ============================================================
-- Responsables múltiples por plan
-- ============================================================
CREATE TABLE plan_responsables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rol plan_responsable_rol NOT NULL DEFAULT 'coresponsable',
  asignado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  asignado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, profile_id)
);

CREATE INDEX idx_plan_responsables_plan ON plan_responsables(plan_id);
CREATE INDEX idx_plan_responsables_profile ON plan_responsables(profile_id);

-- Solo un responsable_principal por plan
CREATE UNIQUE INDEX uq_plan_responsable_principal
  ON plan_responsables(plan_id) WHERE rol = 'responsable_principal';

ALTER TABLE plan_responsables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_responsables_read"
  ON plan_responsables FOR SELECT TO authenticated USING (true);

CREATE POLICY "plan_responsables_write_admin"
  ON plan_responsables FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

-- ============================================================
-- Log de reprogramaciones
-- ============================================================
CREATE TABLE plan_reprogramaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  fecha_anterior DATE,
  fecha_nueva DATE NOT NULL,
  motivo TEXT,
  reprogramado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reprogramado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_reprogramaciones_plan ON plan_reprogramaciones(plan_id);

ALTER TABLE plan_reprogramaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_reprogramaciones_read"
  ON plan_reprogramaciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "plan_reprogramaciones_insert"
  ON plan_reprogramaciones FOR INSERT TO authenticated
  WITH CHECK (
    reprogramado_por = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
      OR EXISTS (
        SELECT 1 FROM plan_responsables
        WHERE plan_id = plan_reprogramaciones.plan_id AND profile_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Flags en planes_accion: evidencia obligatoria + motivo cierre sin evidencia
-- ============================================================
ALTER TABLE planes_accion
  ADD COLUMN evidencia_obligatoria BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE planes_accion
  ADD COLUMN cerrado_sin_evidencia_motivo TEXT;

-- ============================================================
-- Permitir a responsables editar progreso/notas/estado del plan
-- (suma a las policies existentes; PostgreSQL las combina con OR)
-- ============================================================
CREATE POLICY "planes_accion_responsable_update"
  ON planes_accion FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_responsables
      WHERE plan_id = planes_accion.id AND profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plan_responsables
      WHERE plan_id = planes_accion.id AND profile_id = auth.uid()
    )
  );

-- ============================================================
-- Backfill: match exacto por nombre (TEXT) → profile_id
-- Los que no matcheen quedan sin entrada en plan_responsables
-- y deberán reasignarse manualmente desde la UI.
-- ============================================================
INSERT INTO plan_responsables (plan_id, profile_id, rol, asignado_at)
SELECT DISTINCT
  p.id,
  prof.id,
  'responsable_principal'::plan_responsable_rol,
  p.created_at
FROM planes_accion p
JOIN profiles prof
  ON LOWER(TRIM(prof.nombre)) = LOWER(TRIM(p.responsable))
WHERE p.responsable IS NOT NULL
  AND TRIM(p.responsable) <> ''
ON CONFLICT (plan_id, profile_id) DO NOTHING;
