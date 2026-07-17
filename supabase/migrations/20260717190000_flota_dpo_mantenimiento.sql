-- DPO Flota — cierre de gaps de mantenimiento (2.2 / 2.3 / 2.4 / 3.4):
--   1) flota_metas.justificacion: por qué se eligió cada PI (el auditor lo pregunta).
--   2) Metas de los KPIs nuevos: días parado por correctivo y conformidad de neumáticos.
--   3) Historial de cambios del plan preventivo (R2.2.6: demostrar que el plan evoluciona).
--   4) Política de stock por repuesto: días de stock, stock objetivo y clase ABC (R2.3.2).

-- 1) Justificación por KPI
ALTER TABLE flota_metas ADD COLUMN IF NOT EXISTS justificacion TEXT;

-- 2) Metas de KPIs nuevos (updateFlotaMeta es UPDATE-only: la fila debe existir)
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('correctivo_dias_parado', 10, '<=', 'días',
   'Cada día parado por correctivo es una unidad menos para rutear: es el indicador de correctivo que más impacta la disponibilidad de reparto. El dato sale de las fechas de fuera/puesta en servicio que ya se cargan en cada OT.'),
  ('neumaticos_conformidad', 95, '>=', '%',
   'Las cubiertas son el principal consumible de la flota: presión y profundidad fuera de estándar suben el consumo de combustible, generan fallas prematuras y riesgo. Exige la medición milimétrica mensual de todas las cubiertas (DPO 3.4).')
ON CONFLICT (kpi) DO NOTHING;

-- Justificaciones de los KPIs elegidos que el auditor pregunta explícitamente
UPDATE flota_metas SET justificacion =
  'El costo de mantenimiento es el gasto de flota de mayor impacto en el resultado del CD; se sigue mensual separado en preventivo/correctivo/proactivo para orientar el mix hacia preventivo.'
  WHERE kpi = 'costo_total' AND justificacion IS NULL;
UPDATE flota_metas SET justificacion =
  'Las diferencias de stock de repuestos generan compras de urgencia y demoras de OT (unidad parada esperando pieza); la exactitud del inventario es la condición para que el stock mínimo/objetivo funcione.'
  WHERE kpi = 'inventario_exactitud' AND justificacion IS NULL;

-- 3) Historial de cambios del plan preventivo
CREATE TABLE IF NOT EXISTS mantenimiento_plan_tareas_historial (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id    UUID,
  accion      TEXT NOT NULL CHECK (accion IN ('alta','cambio','baja')),
  datos_antes JSONB,
  datos_despues JSONB,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mant_plan_hist_tarea_idx
  ON mantenimiento_plan_tareas_historial (tarea_id, changed_at DESC);

ALTER TABLE mantenimiento_plan_tareas_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mant_plan_hist_read ON mantenimiento_plan_tareas_historial;
CREATE POLICY mant_plan_hist_read ON mantenimiento_plan_tareas_historial
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION mantenimiento_plan_tareas_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO mantenimiento_plan_tareas_historial (tarea_id, accion, datos_despues, changed_by)
    VALUES (NEW.id, 'alta', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO mantenimiento_plan_tareas_historial (tarea_id, accion, datos_antes, datos_despues, changed_by)
      VALUES (NEW.id, 'cambio', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO mantenimiento_plan_tareas_historial (tarea_id, accion, datos_antes, changed_by)
    VALUES (OLD.id, 'baja', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_mantenimiento_plan_tareas_audit ON mantenimiento_plan_tareas;
CREATE TRIGGER trg_mantenimiento_plan_tareas_audit
  AFTER INSERT OR UPDATE OR DELETE ON mantenimiento_plan_tareas
  FOR EACH ROW EXECUTE FUNCTION mantenimiento_plan_tareas_audit();

-- 4) Política de stock por repuesto (R2.3.2)
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS dias_stock INT;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS stock_objetivo NUMERIC;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS clase_abc TEXT
  CHECK (clase_abc IN ('A','B','C'));
