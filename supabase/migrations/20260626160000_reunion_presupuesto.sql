-- =============================================
-- Reunión de Presupuesto (módulo /reuniones) — solo Pampeana
-- =============================================
-- Nuevo tipo de reunión 'presupuesto' para las reuniones de presupuesto con
-- el área de logística. Calendario automático: 1er día hábil desde el 16 del
-- mes (si el 16 cae sáb/dom → lunes) y una semana después (regla 'quincena_2',
-- evaluada en el cron /api/reuniones/cron-crear-diarias).
--
-- Esta migración se aplica SOLO al ref de Pampeana (dpo). Misiones no usa esta
-- solapa (gateada con !IS_MISIONES en la UI).
-- =============================================

BEGIN;

-- 1) Ampliar el CHECK del tipo para incluir 'presupuesto'
ALTER TABLE reuniones_tipos_config
  DROP CONSTRAINT IF EXISTS reuniones_tipos_config_tipo_check;
ALTER TABLE reuniones_tipos_config
  ADD CONSTRAINT reuniones_tipos_config_tipo_check
  CHECK (tipo IN ('logistica','logistica-ventas','matinal-distribucion','warehouse','presupuesto'));

-- 2) Regla de calendario especial (NULL = el cron usa dias_semana)
ALTER TABLE reuniones_tipos_config
  ADD COLUMN IF NOT EXISTS regla_especial text;

COMMENT ON COLUMN reuniones_tipos_config.regla_especial IS
  'Regla de fecha especial para el cron de creación automática. '
  'quincena_2 = 1er día hábil desde el 16 + 7 días. NULL = usar dias_semana.';

-- 3) Alta del tipo Presupuesto.
--    dias_semana = L-V habilita la creación MANUAL en días hábiles; la creación
--    AUTOMÁTICA del cron se rige por regla_especial, no por dias_semana.
INSERT INTO reuniones_tipos_config (tipo, nombre, dias_semana, regla_especial) VALUES
  ('presupuesto', 'Reunión de Presupuesto', ARRAY[1,2,3,4,5], 'quincena_2')
ON CONFLICT (tipo) DO UPDATE
  SET nombre         = EXCLUDED.nombre,
      dias_semana    = EXCLUDED.dias_semana,
      regla_especial = EXCLUDED.regla_especial;

-- 4) Participantes fijos (resueltos por email para no hardcodear UUIDs).
--    Estefania Martinez, Sebastian Roselli, Esteban Altube, Fausto Azzaretti,
--    Ezequiel Teves.
INSERT INTO reuniones_participantes_fijos (tipo, profile_id)
SELECT 'presupuesto', p.id
FROM profiles p
WHERE p.email IN (
  'emartinez@mercosurdistribuciones.com.ar',  -- Estefania Martinez
  'sroselli@mercosur.local',                  -- Sebastian Roselli
  'ealtube@mercosurdrp.com.ar',               -- Esteban Altube
  'fazzaretti@mercosurdrp.com.ar',            -- Fausto Azzaretti
  'eteves@mercosurdrp.com.ar'                 -- Ezequiel Teves
)
ON CONFLICT (tipo, profile_id) DO NOTHING;

COMMIT;
