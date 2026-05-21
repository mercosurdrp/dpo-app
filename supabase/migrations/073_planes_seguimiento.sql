-- =============================================
-- 073 · Planes de Acción · Tarea de seguimiento al cerrar
-- =============================================
-- Al cerrar una tarea/plan se puede programar una tarea de seguimiento
-- (reprogramación que NO mueve la original, sino que crea una nueva).
-- La nueva tarea hereda título/descripción/responsables/punto y queda
-- enlazada a la original vía origen_plan_id.
--
-- Aditivo y seguro para ambos tenants (Pampeana + Misiones): sólo
-- ADD COLUMN + índice, sin enums ni auth_role().
--
-- Idempotente. NOTIFY pgrst al final fuera de transacción.
-- =============================================

BEGIN;

ALTER TABLE planes_accion
  ADD COLUMN IF NOT EXISTS origen_plan_id UUID
    REFERENCES planes_accion(id) ON DELETE SET NULL;

COMMENT ON COLUMN planes_accion.origen_plan_id IS
  'Si esta tarea es un seguimiento, apunta a la tarea original que la generó al cerrarse.';

CREATE INDEX IF NOT EXISTS idx_planes_accion_origen
  ON planes_accion(origen_plan_id);

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
