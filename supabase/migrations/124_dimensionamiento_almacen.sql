-- 124: Dimensionamiento de Almacén — dotación / FTE (DPO Planeamiento 3.1) — SOLO Pampeana
-- Etapa 2: volumen a procesar (ocupacion_bodega_diaria, bultos/día) vs capacidad de
-- procesamiento de la dotación (operarios × productividad bul/HH × horas) → FTE necesarios.

begin;

-- Parámetros de dotación de almacén (en el config del módulo)
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS prod_bul_hh      numeric NOT NULL DEFAULT 300; -- productividad picking (bultos/hora-hombre)
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS horas_turno      numeric NOT NULL DEFAULT 8;   -- horas efectivas por turno
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS dotacion_almacen numeric NOT NULL DEFAULT 0;   -- operarios de depósito actuales

-- KPI de productividad de almacén
INSERT INTO dim_kpi_objetivos (kpi, nombre, unidad, objetivo, mejor_si) VALUES
  ('productividad_almacen', 'Productividad picking', 'bul/HH', 300, 'mayor')
ON CONFLICT (kpi) DO NOTHING;

commit;
