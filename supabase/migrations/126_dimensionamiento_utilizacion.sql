-- 126: Dimensionamiento de Almacén — factor de utilización del turno por rol (DPO Planeamiento 3.1) — SOLO Pampeana
-- El bul/HH y pal/HH del WMS son productividad de horas de actividad PURA, no sostenibles todo el turno.
-- Capacidad efectiva/FTE = prod × horas_turno × utilización (fracción del turno aplicada a la tarea).
-- Sin el factor, FTE necesarios salían irrealmente bajos (1 pickero / 1 maquinista vs 3 / 2 reales).

begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS util_pickeros    numeric NOT NULL DEFAULT 0.35; -- % del turno en picking puro
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS util_maquinistas numeric NOT NULL DEFAULT 0.40; -- % del turno moviendo pallets

-- Dotación real del depósito (relevada 2026-06-16): 3 pickeros, 2 maquinistas (+1 tarea general).
UPDATE dim_config SET dotacion_almacen = 3, dotacion_maquinistas = 2 WHERE id = 1;

commit;
