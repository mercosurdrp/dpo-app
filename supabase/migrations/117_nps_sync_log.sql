-- =============================================
-- 117 · NPS · Log de sincronización con el Power BI de Quilmes
-- =============================================
-- Cada corrida del sync quincenal (cron en la VPS) registra una fila acá.
-- La página /nps muestra la fecha de la última corrida OK como
-- "datos actualizados el …".
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS nps_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL DEFAULT true,
  encuestas INT,
  rmd_meses INT,
  detalle TEXT
);

CREATE INDEX IF NOT EXISTS idx_nps_sync_log_fecha ON nps_sync_log(ejecutado_en);

ALTER TABLE nps_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_sync_log_select_auth" ON nps_sync_log;
CREATE POLICY "nps_sync_log_select_auth"
  ON nps_sync_log FOR SELECT TO authenticated
  USING (true);

-- Escritura solo por service_role (el cron); sin policy de INSERT para authenticated.
GRANT SELECT ON nps_sync_log TO anon, authenticated;
GRANT ALL ON nps_sync_log TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
