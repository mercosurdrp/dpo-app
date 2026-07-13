-- TML (Tiempo Medio de Liberación) — Pampeana.
--
-- 1) `hora_entrada` existía en producción pero en ninguna migración: se había
--    agregado a mano. Sin ella, recrear la base desde cero rompe el alta de TML.
-- 2) El TML nunca puede ser negativo. Un camión que sale antes de que arranque
--    su turno no tiene demora negativa: tiene demora cero. Además un valor
--    negativo pasaba el filtro `tml_minutos <= 25` y se contaba como "dentro de
--    meta", inflando el cumplimiento del indicador.

ALTER TABLE registros_vehiculos
  ADD COLUMN IF NOT EXISTS hora_entrada INTEGER NOT NULL DEFAULT 7;

COMMENT ON COLUMN registros_vehiculos.hora_entrada IS
  'Franja de entrada del turno (6 o 7). El TML se mide contra esta hora.';

COMMENT ON COLUMN registros_vehiculos.tml_minutos IS
  'Minutos entre hora_entrada y la salida del camión (solo egresos). Nunca negativo.';

ALTER TABLE registros_vehiculos
  DROP CONSTRAINT IF EXISTS registros_vehiculos_hora_entrada_valida;
ALTER TABLE registros_vehiculos
  ADD CONSTRAINT registros_vehiculos_hora_entrada_valida
  CHECK (hora_entrada IN (6, 7));

ALTER TABLE registros_vehiculos
  DROP CONSTRAINT IF EXISTS registros_vehiculos_tml_no_negativo;
ALTER TABLE registros_vehiculos
  ADD CONSTRAINT registros_vehiculos_tml_no_negativo
  CHECK (tml_minutos IS NULL OR tml_minutos >= 0);
