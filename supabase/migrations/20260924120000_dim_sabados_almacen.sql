-- Dimensionamiento (DPO Planeamiento 2.3) — SOLO Pampeana
-- Sábados del ALMACÉN: el turno normal del sábado es de 7 a 11; todo lo que sigue
-- se paga como hora extra al 100 %. La operación termina ~14 h en temporada alta
-- (ene, feb, mar, nov, dic) y ~12 h en temporada baja. Pedido de Sebastián del
-- 24/09/2026: el modelo suma, además de las horas extra por volumen (lun-vie),
-- una regla de sábado = dotación efectiva × (hora de fin − 11) × sábados del mes.
-- Sólo almacén: distribución no cambia.
begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS sabado_fin_normal    numeric NOT NULL DEFAULT 11;  -- hora en que termina el turno normal del sábado
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS sabado_fin_alta      numeric NOT NULL DEFAULT 14;  -- hora real de fin en temporada alta
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS sabado_fin_baja      numeric NOT NULL DEFAULT 12;  -- hora real de fin en temporada baja
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS meses_temporada_alta text    NOT NULL DEFAULT '1,2,3,11,12';

commit;
