-- DPO Flota R2.2.6 — "El plan de MP ha evolucionado para resolver proactivamente
-- los problemas recurrentes de mantenimiento correctivo".
--
-- Dos cosas que faltaban para poder demostrarlo:
--   1) Las OT no tenían clasificación: rubro general/neumáticos y texto libre.
--      Para ver qué se repite hace falta el SISTEMA del vehículo (carrocería,
--      pérdidas, luces, eléctrico…). Se guarda en la OT; la app lo sugiere por
--      palabras clave y lo confirma quien carga.
--   2) El historial del plan (trigger de la migración 20260717190000) guarda
--      QUÉ cambió pero no POR QUÉ ni qué correctivos lo justifican. Se agregan
--      motivo, origen, las OT vinculadas y el sistema.
--
-- Misma migración que APLICAR_EN_PAMPEANA_PLAN_MP_EVOLUCION.sql (ambos tenants). Idempotente.
-- El backfill de sistema es sólo de Pampeana (Misiones no carga OT en la app).

-- 1) Sistema de la OT ---------------------------------------------------------
ALTER TABLE mantenimiento_realizados ADD COLUMN IF NOT EXISTS sistema TEXT;

ALTER TABLE mantenimiento_realizados DROP CONSTRAINT IF EXISTS mantenimiento_realizados_sistema_check;
ALTER TABLE mantenimiento_realizados ADD CONSTRAINT mantenimiento_realizados_sistema_check
  CHECK (sistema IS NULL OR sistema IN (
    'motor', 'refrigeracion_fluidos', 'frenos_aire', 'transmision', 'suspension_direccion',
    'electrico', 'luces', 'carroceria_lona', 'cabina_confort', 'neumaticos', 'hidraulico', 'otro'
  ));

CREATE INDEX IF NOT EXISTS mantenimiento_realizados_sistema_fecha_idx
  ON mantenimiento_realizados (sistema, fecha DESC);

COMMENT ON COLUMN mantenimiento_realizados.sistema IS
  'Sistema del vehículo al que pertenece el trabajo (R2.2.6 / R2.4.2). Base del análisis de correctivos recurrentes. NULL = sin clasificar (la app lo sugiere por texto).';

-- 2) Motivo de cada cambio del plan preventivo -------------------------------
ALTER TABLE mantenimiento_plan_tareas_historial ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE mantenimiento_plan_tareas_historial ADD COLUMN IF NOT EXISTS origen TEXT;
ALTER TABLE mantenimiento_plan_tareas_historial ADD COLUMN IF NOT EXISTS ot_ids UUID[];
ALTER TABLE mantenimiento_plan_tareas_historial ADD COLUMN IF NOT EXISTS sistema TEXT;

ALTER TABLE mantenimiento_plan_tareas_historial DROP CONSTRAINT IF EXISTS mant_plan_hist_origen_check;
ALTER TABLE mantenimiento_plan_tareas_historial ADD CONSTRAINT mant_plan_hist_origen_check
  CHECK (origen IS NULL OR origen IN ('correctivo_recurrente', 'fabricante', 'auditoria', 'checklist', 'otro'));

COMMENT ON COLUMN mantenimiento_plan_tareas_historial.motivo IS
  'Por qué se hizo el cambio ("se agrega inspección de lona porque hubo 13 soldaduras en 7 camiones"). Lo escribe la app al guardar la tarea o al explicar un cambio viejo.';
COMMENT ON COLUMN mantenimiento_plan_tareas_historial.ot_ids IS
  'OT (mantenimiento_realizados.id) que justifican el cambio.';

-- El trigger inserta las filas; la app sólo completa motivo/origen/ot_ids/sistema
-- de la fila más nueva de la tarea (la action exige admin/supervisor).
DROP POLICY IF EXISTS mant_plan_hist_update ON mantenimiento_plan_tareas_historial;
CREATE POLICY mant_plan_hist_update ON mantenimiento_plan_tareas_historial
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Verificación
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'mantenimiento_realizados' AND column_name = 'sistema') AS ot_sistema,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'mantenimiento_plan_tareas_historial'
       AND column_name IN ('motivo', 'origen', 'ot_ids', 'sistema')) AS hist_columnas_4,
  (SELECT count(*) FROM mantenimiento_plan_tareas_historial) AS cambios_del_plan;
