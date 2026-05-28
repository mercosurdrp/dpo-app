-- =============================================================
-- ASISTENCIA (MISIONES) · Marca manual + novedad Licencia Gremial
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
-- =============================================================
-- Fixes (solo Misiones — en Pampeana NO se aplica):
--   1) Columnas faltantes en asistencia_marcas (origen / creado_por /
--      creado_en) que el código necesita para "Marcar presente" desde
--      /asistencia. Equivalente a la migración 071_asistencia_marca_manual
--      que en Pampeana ya está aplicada — en Misiones nunca se aplicó y
--      por eso el insert falla con "Could not find the 'creado_en' column".
--   2) Agregar 'licencia_gremial' al CHECK de asistencia_novedades.tipo
--      (la UI gatea 'licencia_gremial' solo cuando IS_MISIONES). 'pergamino'
--      se mantiene válido para no romper filas históricas; el selector en
--      Misiones no lo ofrece (sigue visible en Pampeana).
-- =============================================================

-- 1) asistencia_marcas: columnas para marcas manuales
ALTER TABLE asistencia_marcas
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'biometrica'
    CHECK (origen IN ('biometrica','manual')),
  ADD COLUMN IF NOT EXISTS creado_por UUID,
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ;

-- 2) asistencia_novedades: ampliar CHECK con 'licencia_gremial'
ALTER TABLE asistencia_novedades
  DROP CONSTRAINT IF EXISTS asistencia_novedades_tipo_check;

ALTER TABLE asistencia_novedades
  ADD CONSTRAINT asistencia_novedades_tipo_check
  CHECK (tipo IN ('vacaciones', 'licencia_medica', 'ausente', 'pergamino', 'licencia_gremial'));

-- Refrescar el schema cache de PostgREST para que reconozca las columnas
-- nuevas en la próxima request (sin tener que esperar al reload natural).
NOTIFY pgrst, 'reload schema';
