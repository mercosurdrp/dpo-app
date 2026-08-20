-- =============================================
-- Reunión de Mantenimiento (módulo /reuniones) — solo Pampeana
-- =============================================
-- El tipo 'mantenimiento' ya existía en la base de producción pero nunca tuvo
-- migración: si alguien reconstruía la base, la reunión mensual desaparecía y
-- el cron dejaba de crearla en silencio. Esta migración cierra ese hueco.
--
-- Calendario automático: 2º lunes de cada mes (regla 'segundo_lunes', evaluada
-- en el cron /api/reuniones/cron-crear-diarias, que ya la soporta).
--
-- Es la reunión donde se revisa la inspección edilicia mensual del depósito
-- (la recorrida vive en la app de mantenimiento edilicio) y donde el punto 1.7
-- del DPO busca evidencia de que la rutina de recorridas existe y se ejecuta.
--
-- Todo idempotente: refleja lo que ya está en producción, no lo cambia.
-- =============================================

BEGIN;

-- 1) Ampliar el CHECK del tipo para incluir 'mantenimiento'
ALTER TABLE reuniones_tipos_config
  DROP CONSTRAINT IF EXISTS reuniones_tipos_config_tipo_check;
ALTER TABLE reuniones_tipos_config
  ADD CONSTRAINT reuniones_tipos_config_tipo_check
  CHECK (tipo IN (
    'logistica','logistica-ventas','matinal-distribucion','warehouse',
    'presupuesto','mantenimiento'
  ));

COMMENT ON COLUMN reuniones_tipos_config.regla_especial IS
  'Regla de fecha especial para el cron de creación automática. '
  'quincena_2 = 1er día hábil desde el 16 + 7 días. '
  'segundo_lunes = 2º lunes del mes. NULL = usar dias_semana.';

-- 2) Alta del tipo.
--    dias_semana = [1] habilita la creación MANUAL los lunes; la creación
--    AUTOMÁTICA se rige por regla_especial, no por dias_semana.
INSERT INTO reuniones_tipos_config (tipo, nombre, dias_semana, regla_especial) VALUES
  ('mantenimiento', 'Reunión de Mantenimiento', ARRAY[1], 'segundo_lunes')
ON CONFLICT (tipo) DO UPDATE
  SET nombre         = EXCLUDED.nombre,
      dias_semana    = EXCLUDED.dias_semana,
      regla_especial = EXCLUDED.regla_especial;

-- 3) Participantes fijos (resueltos por email para no hardcodear UUIDs).
INSERT INTO reuniones_participantes_fijos (tipo, profile_id)
SELECT 'mantenimiento', p.id
FROM profiles p
WHERE p.email IN (
  'sroselli@mercosur.local',  -- Sebastián Roselli
  'ealtube@mercosur.local',   -- Esteban Altube
  'eteves@mercosur.local'     -- Ezequiel Teves
)
ON CONFLICT (tipo, profile_id) DO NOTHING;

COMMIT;
