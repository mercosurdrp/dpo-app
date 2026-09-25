-- Dimensionamiento (DPO Planeamiento 2.3, R2.3.5) — SOLO Pampeana
-- Costo de LO EXTRA que pide el dimensionamiento (decisión de Sebastián, 25/09/2026:
-- "el costo de la estructura es innecesario; tengo que demostrar cuánto va a
-- significar lo extra que necesito"): temporales de reparto y segundas vueltas.
-- Las horas extra de almacén ya tienen tarifa en dim_costo_hh.
-- Defaults: sueldo bruto promedio del presupuesto GENTE PxQ 2026 ($960.796)
-- × 1,5 de cargas ≈ $1.440.000/mes; segunda vuelta ≈ 3 personas × 4 h × tarifa
-- de hora extra de entrega + combustible ≈ $125.000. Editables en Costo/HL.
begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS costo_mes_chofer_temporal   numeric NOT NULL DEFAULT 1440000;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS costo_mes_ayudante_temporal numeric NOT NULL DEFAULT 1440000;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS costo_segunda_vuelta        numeric NOT NULL DEFAULT 125000;

commit;
