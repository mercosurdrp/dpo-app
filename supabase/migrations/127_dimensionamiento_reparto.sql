-- 127: Dimensionamiento de Dotación — FTE de reparto (flota/entrega) — SOLO Pampeana
-- FTE de choferes/ayudantes atado a camiones: necesarios = camiones necesarios × tripulación/camión.
-- Dotación actual = FTE promedio real de dpo-app (registros_vehiculos, egresos), no se carga a mano.

begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS choferes_por_camion  numeric NOT NULL DEFAULT 1;  -- choferes por camión
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS ayudantes_por_camion numeric NOT NULL DEFAULT 1;  -- ayudantes por camión

commit;
