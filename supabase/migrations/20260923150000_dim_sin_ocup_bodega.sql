-- Dimensionamiento (DPO Planeamiento 2.3) — SOLO Pampeana
-- La ocupación de bodega por temporada (alta 0,60 / baja 0,35) se probó y se
-- sacó el mismo 23/09/2026: con 35 % y los mínimos por zona, septiembre pedía
-- 11 camiones contra 10 y diciembre 14. La flota vuelve a dimensionarse con la
-- capacidad nominal del camión y el 70 % como corte de capacidad ociosa.
-- Estas columnas quedaron creadas en la base y ya nadie las lee: se borran.
begin;

ALTER TABLE dim_config DROP COLUMN IF EXISTS ocup_bodega_alta;
ALTER TABLE dim_config DROP COLUMN IF EXISTS ocup_bodega_baja;
ALTER TABLE dim_config DROP COLUMN IF EXISTS meses_temporada_alta;

commit;
