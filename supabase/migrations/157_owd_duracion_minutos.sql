-- OWD: duración (minutos) que tardó el empleado observado en realizar la tarea.
-- Pensado para observaciones cronometrables como el checklist vehicular (SOP 1.3
-- "Checklist de Flota"): permite registrar cuánto tardó el chofer en hacer el
-- checklist. Es opcional (NULL = no se midió) y aplica a cualquier plantilla OWD.
-- Aditivo e idempotente, seguro para ambos tenants (Pampeana y Misiones).

ALTER TABLE owd_observaciones
  ADD COLUMN IF NOT EXISTS duracion_minutos INTEGER NULL;

COMMENT ON COLUMN owd_observaciones.duracion_minutos IS
  'Minutos que tardó el empleado observado en completar la tarea (ej: checklist vehicular). Opcional.';
