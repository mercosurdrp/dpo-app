-- =============================================================
-- 053 — sync_log: registro de cada corrida del sync de rechazos
-- =============================================================
-- Una fila por corrida. Permite saber "cuándo y cómo se sincronizó"
-- sin tener que mirar Vercel logs.

CREATE TABLE IF NOT EXISTS sync_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL CHECK (source IN (
    'cron',            -- Vercel cron schedule (Bearer + UA vercel-cron)
    'manual-bearer',   -- humano/herramienta con Authorization: Bearer fuera de Vercel cron
    'manual-session',  -- botón "Sincronizar" desde la UI (sesión Supabase)
    'script'           -- script externo con header x-api-key
  )),
  date_from     DATE,
  date_to       DATE,
  rechazos_upserted  INT NOT NULL DEFAULT 0,
  ventas_upserted    INT NOT NULL DEFAULT 0,
  errors        JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms   INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sync_log_ran_at ON sync_log(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log(source);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- service_role: full access (lo usa el endpoint)
DROP POLICY IF EXISTS "sync_log_all_service" ON sync_log;
CREATE POLICY "sync_log_all_service" ON sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated: solo lectura (para el dashboard / admin)
DROP POLICY IF EXISTS "sync_log_read_authenticated" ON sync_log;
CREATE POLICY "sync_log_read_authenticated" ON sync_log
  FOR SELECT TO authenticated USING (true);
