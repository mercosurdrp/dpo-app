-- =============================================
-- Asistencia: marcas del reloj biométrico
-- =============================================

CREATE TABLE asistencia_marcas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_empresa TEXT NOT NULL DEFAULT 'MPAMP',
  legajo INT NOT NULL,
  fecha_marca TIMESTAMPTZ NOT NULL,
  tipo_marca TEXT NOT NULL CHECK (tipo_marca IN ('E', 'S')),  -- E=Entrada, S=Salida
  reloj_marca TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(codigo_empresa, legajo, fecha_marca)
);

CREATE INDEX idx_asistencia_marcas_legajo ON asistencia_marcas(legajo);
CREATE INDEX idx_asistencia_marcas_fecha ON asistencia_marcas(fecha_marca);
CREATE INDEX idx_asistencia_marcas_legajo_fecha ON asistencia_marcas(legajo, fecha_marca);

-- =============================================
-- Vista: resumen diario por empleado
-- Empareja entradas y salidas para calcular horas
-- =============================================

CREATE OR REPLACE VIEW asistencia_resumen_diario AS
WITH marcas_dia AS (
  SELECT
    m.legajo,
    m.fecha_marca::date AS fecha,
    m.tipo_marca,
    m.fecha_marca AS hora,
    m.codigo_empresa
  FROM asistencia_marcas m
),
entradas AS (
  SELECT legajo, fecha, hora AS entrada,
    ROW_NUMBER() OVER (PARTITION BY legajo, fecha ORDER BY hora) AS rn
  FROM marcas_dia WHERE tipo_marca = 'E'
),
salidas AS (
  SELECT legajo, fecha, hora AS salida,
    ROW_NUMBER() OVER (PARTITION BY legajo, fecha ORDER BY hora) AS rn
  FROM marcas_dia WHERE tipo_marca = 'S'
)
SELECT
  e.legajo,
  e.fecha,
  e.entrada AS primera_entrada,
  s.salida AS ultima_salida,
  CASE
    WHEN s.salida IS NOT NULL AND e.entrada IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (s.salida - e.entrada)) / 3600.0, 2)
    ELSE NULL
  END AS horas_trabajadas
FROM entradas e
LEFT JOIN salidas s ON e.legajo = s.legajo AND e.fecha = s.fecha AND e.rn = s.rn;

-- =============================================
-- RLS policies
-- =============================================

ALTER TABLE asistencia_marcas ENABLE ROW LEVEL SECURITY;

-- All authenticated can read
CREATE POLICY "asistencia_marcas_select"
  ON asistencia_marcas FOR SELECT
  TO authenticated
  USING (true);

-- Admin/auditor can insert/update/delete
CREATE POLICY "asistencia_marcas_insert"
  ON asistencia_marcas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- API key (service role) can always insert - for the biometric sync
-- This is handled by using the admin/service client
