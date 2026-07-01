-- =============================================
-- Trivia MERCOSUR - Juego de conocimiento diario
-- =============================================
-- Desafío diario de 10 preguntas (iguales para todos), tomadas del banco
-- existente de preguntas de capacitaciones (capacitacion_preguntas).
-- Puntaje + ranking mensual (campeón del mes) e histórico.
--
-- Anti-trampa: todas las escrituras se hacen desde server actions con el
-- service-role client. El servidor sella served_at por pregunta y calcula el
-- tiempo transcurrido con SU reloj. Estas tablas son de solo-lectura vía RLS.
-- =============================================

-- ---------------------------------------------
-- Config (singleton). Editable por admin desde la UI.
-- ---------------------------------------------
CREATE TABLE juego_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tiempo_limite_seg INT NOT NULL DEFAULT 20,
  puntos_acierto INT NOT NULL DEFAULT 100,
  bonus_velocidad_max INT NOT NULL DEFAULT 50,
  preguntas_por_dia INT NOT NULL DEFAULT 10,
  -- capacitaciones cuyas preguntas NO entran al sorteo
  capacitaciones_excluidas UUID[] NOT NULL DEFAULT '{}',
  -- no repetir una pregunta si ya salió en los últimos N días
  dias_sin_repetir INT NOT NULL DEFAULT 25,
  activo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO juego_config (id) VALUES (1);

-- ---------------------------------------------
-- Desafío del día: un registro por fecha, mismo set para todos.
-- ---------------------------------------------
CREATE TABLE juego_desafios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,
  -- las preguntas sorteadas, EN ORDEN de presentación
  pregunta_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------
-- Participación: un registro por (empleado, día). Enforce 1 partida/día.
-- Resumen para ranking rápido.
-- ---------------------------------------------
CREATE TABLE juego_participaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  desafio_id UUID NOT NULL REFERENCES juego_desafios(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  puntos INT NOT NULL DEFAULT 0,
  correctas INT NOT NULL DEFAULT 0,
  respondidas INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  tiempo_total_ms INT NOT NULL DEFAULT 0,
  iniciado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completado_at TIMESTAMPTZ,
  UNIQUE(desafio_id, empleado_id)
);

-- ---------------------------------------------
-- Respuestas: un registro por (participación, pregunta).
-- La fila se crea cuando el server "sirve" la pregunta (served_at); luego se
-- actualiza al responder. respuesta_elegida NULL = no respondió / timeout.
-- ---------------------------------------------
CREATE TABLE juego_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participacion_id UUID NOT NULL REFERENCES juego_participaciones(id) ON DELETE CASCADE,
  desafio_id UUID NOT NULL REFERENCES juego_desafios(id) ON DELETE CASCADE,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  pregunta_id UUID NOT NULL REFERENCES capacitacion_preguntas(id) ON DELETE CASCADE,
  orden INT NOT NULL,
  served_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  respuesta_elegida INT,
  es_correcta BOOLEAN NOT NULL DEFAULT false,
  tiempo_ms INT,
  puntos INT NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ,
  UNIQUE(participacion_id, pregunta_id)
);

-- ---------------------------------------------
-- Índices
-- ---------------------------------------------
CREATE INDEX idx_juego_participaciones_fecha ON juego_participaciones(fecha);
CREATE INDEX idx_juego_participaciones_emp ON juego_participaciones(empleado_id);
CREATE INDEX idx_juego_respuestas_part ON juego_respuestas(participacion_id);
CREATE INDEX idx_juego_respuestas_emp ON juego_respuestas(empleado_id);

-- =============================================
-- RLS: lectura para autenticados, escritura solo service-role (bypass RLS).
-- No definimos políticas de INSERT/UPDATE/DELETE para authenticated: todas las
-- mutaciones pasan por server actions con service role.
-- =============================================
ALTER TABLE juego_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE juego_desafios ENABLE ROW LEVEL SECURITY;
ALTER TABLE juego_participaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE juego_respuestas ENABLE ROW LEVEL SECURITY;

-- Config: lectura abierta; edición admin/auditor (además de service role).
CREATE POLICY "juego_config_read"
  ON juego_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "juego_config_update_admin"
  ON juego_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

-- Desafíos: lectura abierta (para renderizar el set del día).
CREATE POLICY "juego_desafios_read"
  ON juego_desafios FOR SELECT TO authenticated USING (true);

-- Participaciones: lectura abierta (necesaria para el ranking de todos).
CREATE POLICY "juego_participaciones_read"
  ON juego_participaciones FOR SELECT TO authenticated USING (true);

-- Respuestas: el empleado solo ve LAS SUYAS (privacidad; el ranking usa participaciones).
CREATE POLICY "juego_respuestas_read_self"
  ON juego_respuestas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM empleados e
      WHERE e.id = juego_respuestas.empleado_id
        AND e.profile_id = auth.uid()
    )
  );
