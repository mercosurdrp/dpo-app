-- Inversiones: suma el horizonte "a 4 años" (antes 1, 2, 3, 5).
ALTER TABLE presupuestos_inversiones
  DROP CONSTRAINT IF EXISTS presupuestos_inversiones_horizonte_anios_check;
ALTER TABLE presupuestos_inversiones
  ADD CONSTRAINT presupuestos_inversiones_horizonte_anios_check
  CHECK (horizonte_anios IN (1, 2, 3, 4, 5));
COMMENT ON COLUMN presupuestos_inversiones.horizonte_anios IS
  'Horizonte de la inversión en años: 1 = del año, 2, 3, 4 o 5 años.';
NOTIFY pgrst, 'reload schema';
