-- Dimensionamiento (DPO 3.1): escenario de volumen — % de ajuste editable por mes
-- sobre el HL proyectado del presupuesto. La proyección de flota/almacén usa
-- hl × (1 + ajuste_pct/100); 0 = sin ajuste (comportamiento actual).

begin;

ALTER TABLE dim_volumen_proyectado ADD COLUMN IF NOT EXISTS ajuste_pct numeric NOT NULL DEFAULT 0;

commit;
