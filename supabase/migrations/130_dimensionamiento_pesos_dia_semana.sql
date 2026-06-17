-- 130: Dimensionamiento — pesos de volumen por día de semana (DPO 3.1) — SOLO Pampeana
-- La proyección reparte el volumen semanal según el peso de cada día (jue/vie son los fuertes),
-- así los días pico generan horas extra (almacén) y días de 2ª vuelta (flota) de forma realista.
-- Pesos editables; deben sumar ~1 (domingo no opera).

begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS peso_lun numeric NOT NULL DEFAULT 0.10;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS peso_mar numeric NOT NULL DEFAULT 0.10;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS peso_mie numeric NOT NULL DEFAULT 0.15;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS peso_jue numeric NOT NULL DEFAULT 0.25;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS peso_vie numeric NOT NULL DEFAULT 0.25;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS peso_sab numeric NOT NULL DEFAULT 0.15;

commit;
