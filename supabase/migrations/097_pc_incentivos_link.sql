-- =============================================
-- 097 · Incentivos — link de evidencia de comunicación
-- =============================================
-- Permite registrar la comunicación al equipo también con un LINK (mail, video,
-- carpeta de Drive, etc.), además del archivo subido. Idempotente.
-- =============================================

ALTER TABLE pc_incentivos_programa ADD COLUMN IF NOT EXISTS comunicado_link TEXT;

NOTIFY pgrst, 'reload schema';
