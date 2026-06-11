-- =============================================================================
-- 114: Comentario / justificativo del fin de preventa en ruteo_cierres.
-- -----------------------------------------------------------------------------
-- Cuando el fin de preventa (SLA Ventas↔Operaciones: L-V 08:00 · sáb 07:00) o
-- el fin del ruteo (L-V 09:00 · sáb 07:30) quedan fuera de horario, tiene que
-- poder dejarse un justificativo. Para el fin de ruteo ya existe `notas`; esta
-- columna cubre el comentario del fin de preventa.
-- Pampeana-only: ruteo_cierres no existe en la Supabase de Misiones.
-- =============================================================================

ALTER TABLE ruteo_cierres
  ADD COLUMN IF NOT EXISTS comentario_preventa TEXT;

COMMENT ON COLUMN ruteo_cierres.comentario_preventa IS
  'Justificativo/observación del horario de fin de preventa (ej. por qué se pasó del límite SLA).';
