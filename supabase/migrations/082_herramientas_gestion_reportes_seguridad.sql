-- =============================================
-- 082 · Herramientas de Gestión también sobre reportes de seguridad.
-- Generaliza plan_herramientas_gestion para apuntar a:
--   plan_id (planes_accion) | reunion_actividad_id | reporte_seguridad_id
-- Aplicar en Pampeana y Misiones. Idempotente.
-- =============================================

BEGIN;

-- Nuevo target: reporte de seguridad
ALTER TABLE plan_herramientas_gestion
  ADD COLUMN IF NOT EXISTS reporte_seguridad_id UUID
    REFERENCES reportes_seguridad(id) ON DELETE CASCADE;

-- Exactamente uno de los tres targets debe estar presente
ALTER TABLE plan_herramientas_gestion
  DROP CONSTRAINT IF EXISTS plan_herramientas_target_chk;
ALTER TABLE plan_herramientas_gestion
  ADD CONSTRAINT plan_herramientas_target_chk
  CHECK (
    (
      (CASE WHEN plan_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN reunion_actividad_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN reporte_seguridad_id IS NOT NULL THEN 1 ELSE 0 END)
    ) = 1
  );

CREATE INDEX IF NOT EXISTS idx_plan_herramientas_reporte
  ON plan_herramientas_gestion(reporte_seguridad_id);

-- =============================================
-- RLS: INSERT/UPDATE ahora cubren también reportes de seguridad
-- (autor del reporte, o admin/supervisor/admin_rrhh).
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
    OR
    (
      reporte_seguridad_id IS NOT NULL AND (
        reporte_seguridad_id IN (
          SELECT id FROM reportes_seguridad WHERE creado_por = auth.uid()
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
    OR
    (
      reporte_seguridad_id IS NOT NULL AND (
        reporte_seguridad_id IN (
          SELECT id FROM reportes_seguridad WHERE creado_por = auth.uid()
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
    OR
    (
      reporte_seguridad_id IS NOT NULL AND (
        reporte_seguridad_id IN (
          SELECT id FROM reportes_seguridad WHERE creado_por = auth.uid()
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
