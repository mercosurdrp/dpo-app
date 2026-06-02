-- =============================================
-- 092 · Períodos Críticos — delta_clientes en escenarios del Simulador
-- =============================================
-- pc_escenarios (mig 083) nació con delta_volumen/delta_otif/delta_ausentismo
-- pero SIN delta_clientes, aunque el Simulador ya tiene el slider de Clientes y
-- lo usa en el cálculo en vivo. Esta columna permite persistir también ese
-- delta para que al recargar un escenario las 4 variables vuelvan completas.
-- Idempotente. NOTIFY pgrst al final.
-- =============================================

BEGIN;

ALTER TABLE pc_escenarios
  ADD COLUMN IF NOT EXISTS delta_clientes NUMERIC(5,2) NOT NULL DEFAULT 0; -- % ej. 25 → +25%

COMMIT;

NOTIFY pgrst, 'reload schema';
