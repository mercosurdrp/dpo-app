-- Edición online de la evidencia DPO (puente Google Drive): mientras un
-- archivo se está editando en Docs/Sheets/Slides, estas columnas guardan la
-- referencia al archivo temporal en Drive. Al terminar (o cancelar) vuelven
-- a NULL. Una edición en curso por archivo.
ALTER TABLE dpo_archivos
  ADD COLUMN IF NOT EXISTS edicion_drive_id TEXT,
  ADD COLUMN IF NOT EXISTS edicion_drive_url TEXT,
  ADD COLUMN IF NOT EXISTS edicion_iniciada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edicion_iniciada_por_nombre TEXT;
