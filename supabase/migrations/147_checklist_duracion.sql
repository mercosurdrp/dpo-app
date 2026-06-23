-- Duración de llenado del checklist de vehículos: inicio (cuando el chofer
-- abre el form) y duración total en segundos (fin - inicio, reloj del cliente).
-- El "fin" es la columna `hora` ya existente.
ALTER TABLE checklist_vehiculos
  ADD COLUMN IF NOT EXISTS iniciado_en timestamptz,
  ADD COLUMN IF NOT EXISTS duracion_segundos integer;

COMMENT ON COLUMN checklist_vehiculos.iniciado_en IS 'Momento en que el chofer abrió el formulario de checklist (inicio de llenado).';
COMMENT ON COLUMN checklist_vehiculos.duracion_segundos IS 'Segundos que tardó en completarse el checklist (fin - inicio, medido con el reloj del cliente).';
