-- =============================================
-- 077 · Herramientas de Gestión también sobre actividades de reunión.
-- Generaliza plan_herramientas_gestion para apuntar a un plan O a una
-- actividad de reunión (reuniones_actividades). Aditivo y seguro.
-- Aplicar en Pampeana. Idempotente.
-- =============================================

BEGIN;

-- plan_id pasa a opcional (ahora el target puede ser una actividad)
ALTER TABLE plan_herramientas_gestion
  ALTER COLUMN plan_id DROP NOT NULL;

-- Nuevo target: actividad de reunión
ALTER TABLE plan_herramientas_gestion
  ADD COLUMN IF NOT EXISTS reunion_actividad_id UUID
    REFERENCES reuniones_actividades(id) ON DELETE CASCADE;

-- Exactamente uno de los dos targets debe estar presente
ALTER TABLE plan_herramientas_gestion
  DROP CONSTRAINT IF EXISTS plan_herramientas_target_chk;
ALTER TABLE plan_herramientas_gestion
  ADD CONSTRAINT plan_herramientas_target_chk
  CHECK ((plan_id IS NOT NULL) <> (reunion_actividad_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_plan_herramientas_actividad
  ON plan_herramientas_gestion(reunion_actividad_id);

-- =============================================
-- RLS: INSERT/UPDATE ahora cubren plan O actividad
-- (responsable del target, o admin/supervisor/admin_rrhh).
-- SELECT (true) y DELETE (autor o editor) no cambian.
-- =============================================
DROP POLICY IF EXISTS "herramientas_gestion_insert"
  ON plan_herramientas_gestion;
CREATE POLICY "herramientas_gestion_insert"
  ON plan_herramientas_gestion FOR INSERT TO authenticated
  WITH CHECK (
    (
      plan_id IS NOT NULL AND (
        plan_id IN (
          SELECT plan_id FROM plan_responsables WHERE profile_id = auth.uid()
        )
        OR plan_id IN (
          SELECT id FROM planes_accion WHERE created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
        )
      )
    )
    OR
    (
      reunion_actividad_id IS NOT NULL AND (
        reunion_actividad_id IN (
          SELECT id FROM reuniones_actividades WHERE responsable_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
        )
      )
    )
  );

DROP POLICY IF EXISTS "herramientas_gestion_update"
  ON plan_herramientas_gestion;
CREATE POLICY "herramientas_gestion_update"
  ON plan_herramientas_gestion FOR UPDATE TO authenticated
  USING (
    (
      plan_id IS NOT NULL AND (
        plan_id IN (
          SELECT plan_id FROM plan_responsables WHERE profile_id = auth.uid()
        )
        OR plan_id IN (
          SELECT id FROM planes_accion WHERE created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
        )
      )
    )
    OR
    (
      reunion_actividad_id IS NOT NULL AND (
        reunion_actividad_id IN (
          SELECT id FROM reuniones_actividades WHERE responsable_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
        )
      )
    )
  )
  WITH CHECK (
    (
      plan_id IS NOT NULL AND (
        plan_id IN (
          SELECT plan_id FROM plan_responsables WHERE profile_id = auth.uid()
        )
        OR plan_id IN (
          SELECT id FROM planes_accion WHERE created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
        )
      )
    )
    OR
    (
      reunion_actividad_id IS NOT NULL AND (
        reunion_actividad_id IN (
          SELECT id FROM reuniones_actividades WHERE responsable_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'admin_rrhh')
        )
      )
    )
  );

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
