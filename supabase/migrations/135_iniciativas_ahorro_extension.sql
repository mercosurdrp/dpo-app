-- =============================================
-- 135 · Iniciativas de Ahorro · campos extra (plantilla Misiones)
-- =============================================
-- Extiende `presupuestos_iniciativas` (mig 127) con los campos de la plantilla
-- que usan los decks de Misiones (Distribución / Gente / Operaciones):
-- área, CAPEX/inversión, nivel de impacto, acciones clave y justificación.
-- Todos nullable → no rompe inserts existentes.
-- Idempotente.
-- =============================================

BEGIN;

ALTER TABLE presupuestos_iniciativas
  ADD COLUMN IF NOT EXISTS area           text
    CHECK (area IN ('distribucion', 'gente', 'operaciones', 'otro')),
  ADD COLUMN IF NOT EXISTS inversion_capex numeric(14,2),
  ADD COLUMN IF NOT EXISTS nivel_impacto   smallint
    CHECK (nivel_impacto BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS acciones_clave  text,
  ADD COLUMN IF NOT EXISTS justificacion   text;

COMMIT;

NOTIFY pgrst, 'reload schema';
