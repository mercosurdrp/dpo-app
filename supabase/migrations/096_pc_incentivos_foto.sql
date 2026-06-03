-- =============================================
-- 096 · Incentivos — foto del ganador (sección Premiación)
-- =============================================
-- Suma foto a pc_incentivos_registro para la galería de premiación (1°/2°/3°
-- por ámbito con nombre + foto, como en la PPT). Foto al bucket 'reuniones',
-- prefijo 'incentivos-pc/ganadores/'. Idempotente.
-- =============================================

ALTER TABLE pc_incentivos_registro ADD COLUMN IF NOT EXISTS foto_path   TEXT;
ALTER TABLE pc_incentivos_registro ADD COLUMN IF NOT EXISTS foto_nombre TEXT;

NOTIFY pgrst, 'reload schema';
