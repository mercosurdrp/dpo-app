-- 131: Dimensionamiento — plantel cargable de choferes/ayudantes (DPO 3.1) — SOLO Pampeana
-- Permite cargar a mano el plantel de reparto; 0 = usar el promedio real de registros_vehiculos.

begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS dotacion_choferes  numeric NOT NULL DEFAULT 0;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS dotacion_ayudantes numeric NOT NULL DEFAULT 0;

commit;
