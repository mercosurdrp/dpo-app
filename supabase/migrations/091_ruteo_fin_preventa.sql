-- =============================================
-- 091 · Ruteo: registro de FIN DE PREVENTA (feature Pampeana-only)
-- =============================================
-- Para el SLA Ventas↔Operaciones (plan_syop) se mide el horario en que Ventas
-- entrega la preventa a Ruteo. Se registra en la fila del día de ruteo_cierres.
--
-- Cambios:
--   • Nueva columna hora_fin_preventa (timestamp real del aviso/clic).
--   • estado admite 'pendiente': la fila puede crearse SOLO con el fin de
--     preventa, antes de iniciar el ruteo. INICIO DE RUTEO la pasa a 'en_curso'.
--   • hora_inicio pasa a NULLABLE (una fila 'pendiente' todavía no tiene inicio).
--
-- Aplicar SOLO en la Supabase de Pampeana (dpo-app-self). Idempotente.
-- =============================================

BEGIN;

-- 1) Nueva columna ------------------------------------------------------------
ALTER TABLE ruteo_cierres
  ADD COLUMN IF NOT EXISTS hora_fin_preventa TIMESTAMPTZ;

-- 2) hora_inicio deja de ser obligatoria / con default ------------------------
ALTER TABLE ruteo_cierres ALTER COLUMN hora_inicio DROP NOT NULL;
ALTER TABLE ruteo_cierres ALTER COLUMN hora_inicio DROP DEFAULT;

-- 3) estado admite 'pendiente' ------------------------------------------------
ALTER TABLE ruteo_cierres DROP CONSTRAINT IF EXISTS ruteo_cierres_estado_check;
ALTER TABLE ruteo_cierres
  ADD CONSTRAINT ruteo_cierres_estado_check
  CHECK (estado IN ('pendiente', 'en_curso', 'cerrado'));

-- 4) Integridad: solo 'pendiente' puede no tener hora_inicio ------------------
ALTER TABLE ruteo_cierres DROP CONSTRAINT IF EXISTS ruteo_cierres_inicio_ok;
ALTER TABLE ruteo_cierres
  ADD CONSTRAINT ruteo_cierres_inicio_ok
  CHECK (estado = 'pendiente' OR hora_inicio IS NOT NULL);

COMMIT;

NOTIFY pgrst, 'reload schema';
