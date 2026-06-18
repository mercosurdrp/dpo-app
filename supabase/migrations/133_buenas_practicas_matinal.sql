-- =============================================
-- 133 · Buenas Prácticas · Reconocimiento en reunión matinal
-- =============================================
-- El reconocimiento al empleado se da en la reunión matinal. Guardamos la
-- fecha de la matinal en la que se reconoció/comunicó la buena práctica, en
-- lugar de un texto libre.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

ALTER TABLE bp_ideas
  ADD COLUMN IF NOT EXISTS reconocida_matinal_fecha DATE;

COMMIT;

NOTIFY pgrst, 'reload schema';
