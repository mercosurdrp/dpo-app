-- =============================================
-- 039 · RRHH: jornadas plantilla, asignaciones y excepciones
-- =============================================
-- Modelo de jornadas de trabajo para alimentar reportes de asistencia
-- (inasistencias, total horas vs jornada esperada, pausas).
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS rrhh_jornadas_plantilla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,                   -- 'Mañana 6-14', 'Tarde 14-22', 'Administrativo'
  hora_entrada TIME NOT NULL,
  hora_salida TIME NOT NULL,
  tolerancia_minutos INT NOT NULL DEFAULT 10,
  horas_esperadas NUMERIC(4,2) NOT NULL DEFAULT 8.0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rrhh_jornadas_asignacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  jornada_id UUID NOT NULL REFERENCES rrhh_jornadas_plantilla(id),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,                     -- NULL = vigente
  dias_semana INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5], -- 1=lun, 7=dom (ISO)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE INDEX IF NOT EXISTS idx_jornadas_asignacion_empleado
  ON rrhh_jornadas_asignacion(empleado_id);
CREATE INDEX IF NOT EXISTS idx_jornadas_asignacion_vigencia
  ON rrhh_jornadas_asignacion(vigente_desde, vigente_hasta);

-- Excepciones puntuales: una fecha específica reemplaza la plantilla.
CREATE TABLE IF NOT EXISTS rrhh_jornadas_excepcion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_entrada TIME,
  hora_salida TIME,
  motivo TEXT,
  no_laborable BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empleado_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_jornadas_excepcion_fecha
  ON rrhh_jornadas_excepcion(fecha);

-- Función: obtener la jornada esperada de un empleado en una fecha.
-- Excepción tiene prioridad. Si no, plantilla vigente que matchea día de semana.
-- Devuelve hora_entrada, hora_salida, no_laborable.
CREATE OR REPLACE FUNCTION rrhh_jornada_esperada(p_empleado_id UUID, p_fecha DATE)
RETURNS TABLE (
  hora_entrada TIME,
  hora_salida TIME,
  no_laborable BOOLEAN,
  fuente TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_dia_semana INT;
BEGIN
  -- 1) Excepción puntual.
  RETURN QUERY
  SELECT e.hora_entrada, e.hora_salida, e.no_laborable, 'excepcion'::TEXT
  FROM rrhh_jornadas_excepcion e
  WHERE e.empleado_id = p_empleado_id AND e.fecha = p_fecha
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 2) Plantilla vigente que cubre este día de la semana.
  v_dia_semana := EXTRACT(ISODOW FROM p_fecha)::INT;

  RETURN QUERY
  SELECT p.hora_entrada, p.hora_salida, false, 'plantilla'::TEXT
  FROM rrhh_jornadas_asignacion a
  JOIN rrhh_jornadas_plantilla p ON p.id = a.jornada_id
  WHERE a.empleado_id = p_empleado_id
    AND a.vigente_desde <= p_fecha
    AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= p_fecha)
    AND v_dia_semana = ANY(a.dias_semana)
  ORDER BY a.vigente_desde DESC
  LIMIT 1;
END;
$$;

COMMIT;
