-- 125: Dimensionamiento de Almacén — rol MAQUINISTAS (DPO Planeamiento 3.1) — SOLO Pampeana
-- Maquinistas (autoelevadoristas): demanda = pallets a procesar (acarreo descargado +
-- carga de distribución [+ retorno opcional]) vs productividad pal/HH (deposito-esteban).
-- Pickeros ya usaban prod_bul_hh / dotacion_almacen (mig 124).

begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS prod_pal_h            numeric NOT NULL DEFAULT 15;  -- productividad maquinistas (pallets/hora-hombre)
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS dotacion_maquinistas  numeric NOT NULL DEFAULT 3;   -- maquinistas actuales (Diego/Pablo/Pedro)
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS factor_retorno_distrib numeric NOT NULL DEFAULT 0;   -- % de los pallets cargados que se descargan al volver (0 = no contar retorno)

INSERT INTO dim_kpi_objetivos (kpi, nombre, unidad, objetivo, mejor_si) VALUES
  ('productividad_maquinistas', 'Productividad maquinistas', 'pal/HH', 15, 'mayor')
ON CONFLICT (kpi) DO NOTHING;

commit;
