-- 123: Dimensionamiento en Cajas Equivalentes (CEq) — SOLO Pampeana
-- La capacidad de camiones y la ocupación se miden en CEq (no bultos físicos).
-- El volumen de ruteo_cierres (bultos, sin SKU) se convierte a CEq con un factor
-- promedio editable (dim_config.factor_ceq_bulto). CEq por SKU = 120×bultos/bultosPallet.

begin;

-- capacidad de la flota pasa a expresarse en CEq
ALTER TABLE dim_flota_capacidad RENAME COLUMN capacidad_bultos TO capacidad_ceq;

-- factor de conversión bultos → CEq (1 = neutro hasta calibrar con el mix real)
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS factor_ceq_bulto numeric NOT NULL DEFAULT 1;

-- unidades de los KPIs en CEq
UPDATE dim_kpi_objetivos SET unidad = 'CEq/cliente' WHERE kpi = 'dropsize';
UPDATE dim_kpi_objetivos SET unidad = 'CEq/viaje'   WHERE kpi = 'entregas_por_viaje';

commit;
