-- =============================================
-- Reunión Warehouse · el que vuelve de una ausencia entra parejo
-- =============================================
-- El sorteo prioriza a quien menos veces expuso, así que el que vuelve de
-- vacaciones (con 0 exposiciones) salía sorteado varias veces seguidas.
--
-- - `veces_offset`: exposiciones "de arranque" que se le acreditan al volver,
--   para que entre en el mismo punto de la rueda que el resto en vez de
--   arrancar de cero. No es historia real: sólo pesa en el sorteo.
-- - `reingreso_fecha`: el día que volvió. Ese día no expone, para que primero
--   vea la dinámica de la reunión.
--
-- Idempotente. Solo Pampeana.
-- =============================================

ALTER TABLE warehouse_expositor_plantel
  ADD COLUMN IF NOT EXISTS veces_offset INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reingreso_fecha DATE;

COMMENT ON COLUMN warehouse_expositor_plantel.veces_offset IS
  'Exposiciones acreditadas al reactivar, para que el que vuelve de una ausencia entre parejo con el grupo. No cuenta como historia real.';
COMMENT ON COLUMN warehouse_expositor_plantel.reingreso_fecha IS
  'Día en que volvió de la ausencia. Ese día queda fuera del sorteo.';

NOTIFY pgrst, 'reload schema';
