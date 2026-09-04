-- =============================================
-- 150 · Inversiones: horizonte de planificación
-- =============================================
-- Una inversión se planifica para el año en curso o a 2, 3 o 5 años.
-- `anio` sigue siendo el año del presupuesto en el que se carga; el horizonte
-- dice a cuántos años se piensa la inversión (1 = del año).
-- Las filas existentes y las que llegan del sync de Plan de Mantenimiento
-- Edilicio quedan como "del año" (default 1).
-- =============================================

BEGIN;

ALTER TABLE presupuestos_inversiones
  ADD COLUMN IF NOT EXISTS horizonte_anios int NOT NULL DEFAULT 1;

ALTER TABLE presupuestos_inversiones
  DROP CONSTRAINT IF EXISTS presupuestos_inversiones_horizonte_anios_check;
ALTER TABLE presupuestos_inversiones
  ADD CONSTRAINT presupuestos_inversiones_horizonte_anios_check
  CHECK (horizonte_anios IN (1, 2, 3, 5));

CREATE INDEX IF NOT EXISTS idx_presup_inversiones_horizonte
  ON presupuestos_inversiones(anio, horizonte_anios);

COMMENT ON COLUMN presupuestos_inversiones.horizonte_anios IS
  'Horizonte de la inversión en años: 1 = del año, 2, 3 o 5 años.';

COMMIT;

NOTIFY pgrst, 'reload schema';
