-- =============================================
-- 092 · Ruteo: VOLUMEN NO RUTEADO (Pushed) — feature Pampeana-only
-- =============================================
-- Para el SLA plan_ruteo_pushed (volumen no ruteado) el ruteador carga, al
-- cerrar el ruteo, la cantidad de bultos que quedaron sin entrar en ruta.
--
-- (El fin de preventa, el estado 'pendiente' y hora_inicio nullable ya fueron
--  agregados por la migración 091_ruteo_fin_preventa.sql.)
--
-- Aplicar SOLO en la Supabase de Pampeana (dpo-app-self). Idempotente.
-- =============================================

BEGIN;

ALTER TABLE ruteo_cierres
  ADD COLUMN IF NOT EXISTS bultos_no_ruteados INT NOT NULL DEFAULT 0;

ALTER TABLE ruteo_cierres DROP CONSTRAINT IF EXISTS ruteo_cierres_no_ruteados_ok;
ALTER TABLE ruteo_cierres
  ADD CONSTRAINT ruteo_cierres_no_ruteados_ok CHECK (bultos_no_ruteados >= 0);

COMMIT;

NOTIFY pgrst, 'reload schema';
