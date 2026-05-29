-- =============================================
-- Períodos Críticos — DPO 2026 v2.1, Pilar Planeamiento, R3.4.1
--
-- Calendario de días críticos basado en VOLUMEN (HL) + OTIF (proxy: 1 - %rechazo)
-- + AUSENTISMO. Cada día recibe un score ponderado y se clasifica en
-- BAJO / MEDIO / ALTO. Habilita la lectura del R3.4.1 y alimenta el simulador.
--
-- Tablas:
--  • pc_volumen_historico_2025  → seed desde Excel (DB Misiones arranca en 2026)
--  • pc_ausentismo_mensual      → upload mensual de RRHH (% ausentismo)
--  • pc_feriados                → feriados 2025 + 2026 (extensible)
--  • pc_config                  → pesos w_vol/w_otif/w_aus + umbrales (1 fila)
--  • pc_escenarios              → escenarios del simulador (3 sliders)
--
-- Vista:
--  • v_pc_calendario_dia        → score + nivel BAJO/MEDIO/ALTO por día
-- =============================================

-- ---------------------------------------------------------------------------
-- 1. Histórico de volumen (año anterior, requerido por R3.4.1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_volumen_historico_2025 (
  fecha          DATE PRIMARY KEY,
  hl_total       NUMERIC(14,4) NOT NULL DEFAULT 0,
  hl_rechazo     NUMERIC(14,4) NOT NULL DEFAULT 0,
  bultos_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
  camiones       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Ausentismo mensual (carga vía Excel desde RRHH)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_ausentismo_mensual (
  anio           INT NOT NULL CHECK (anio BETWEEN 2024 AND 2035),
  mes            INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  pct_ausentismo NUMERIC(6,4) NOT NULL CHECK (pct_ausentismo >= 0 AND pct_ausentismo <= 1),
  total_planta   INT,
  total_ausentes NUMERIC(8,2),
  comentario     TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (anio, mes)
);

-- ---------------------------------------------------------------------------
-- 3. Feriados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_feriados (
  fecha   DATE PRIMARY KEY,
  nombre  TEXT NOT NULL,
  tipo    TEXT NOT NULL DEFAULT 'nacional'   -- nacional | provincial | empresa
);

INSERT INTO pc_feriados (fecha, nombre) VALUES
  ('2025-01-01','Año Nuevo'),
  ('2025-03-03','Carnaval'),
  ('2025-03-04','Carnaval'),
  ('2025-03-24','Día de la Memoria'),
  ('2025-04-02','Día de Malvinas'),
  ('2025-04-17','Jueves Santo'),
  ('2025-04-18','Viernes Santo'),
  ('2025-05-01','Día del Trabajador'),
  ('2025-05-25','Revolución de Mayo'),
  ('2025-06-16','Gral. Güemes (trasladado)'),
  ('2025-06-20','Gral. Belgrano'),
  ('2025-07-09','Día de la Independencia'),
  ('2025-08-17','Gral. San Martín'),
  ('2025-10-10','Diversidad Cultural (trasladado)'),
  ('2025-11-24','Soberanía Nacional'),
  ('2025-12-08','Inmaculada Concepción'),
  ('2025-12-25','Navidad'),
  ('2026-01-01','Año Nuevo'),
  ('2026-02-16','Carnaval'),
  ('2026-02-17','Carnaval'),
  ('2026-03-24','Día de la Memoria'),
  ('2026-04-02','Día de Malvinas'),
  ('2026-04-03','Viernes Santo'),
  ('2026-05-01','Día del Trabajador'),
  ('2026-05-25','Revolución de Mayo'),
  ('2026-06-15','Gral. Güemes'),
  ('2026-06-20','Gral. Belgrano'),
  ('2026-07-09','Día de la Independencia'),
  ('2026-08-17','Gral. San Martín'),
  ('2026-10-12','Diversidad Cultural'),
  ('2026-11-23','Soberanía Nacional'),
  ('2026-12-08','Inmaculada Concepción'),
  ('2026-12-25','Navidad')
ON CONFLICT (fecha) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Configuración (1 sola fila, id=1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_config (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  anio_vigente    INT NOT NULL DEFAULT 2026,
  w_vol           NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  w_otif          NUMERIC(4,3) NOT NULL DEFAULT 0.300,
  w_aus           NUMERIC(4,3) NOT NULL DEFAULT 0.200,
  umbral_alto     NUMERIC(4,3) NOT NULL DEFAULT 0.750,   -- score >= → ALTO
  umbral_medio    NUMERIC(4,3) NOT NULL DEFAULT 0.250,   -- score >= → MEDIO (sino BAJO)
  hl_p90_2025     NUMERIC(14,4),                          -- cache del P90 para normalizar volumen
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CHECK (abs(w_vol + w_otif + w_aus - 1.0) < 0.001),
  CHECK (umbral_alto > umbral_medio)
);

INSERT INTO pc_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Escenarios del simulador
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_escenarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  fecha_base      DATE NOT NULL,
  delta_volumen   NUMERIC(5,2) NOT NULL DEFAULT 0,  -- % ej. 25 → +25%
  delta_otif      NUMERIC(5,2) NOT NULL DEFAULT 0,  -- puntos porcentuales
  delta_ausentismo NUMERIC(5,2) NOT NULL DEFAULT 0, -- puntos porcentuales
  resultado_score NUMERIC(6,3),
  resultado_nivel TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_escenarios_fecha_base
  ON pc_escenarios(fecha_base DESC);

DROP TRIGGER IF EXISTS trg_pc_escenarios_updated_at ON pc_escenarios;
CREATE TRIGGER trg_pc_escenarios_updated_at
  BEFORE UPDATE ON pc_escenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Vista del calendario diario (datos reales + score + nivel)
--
-- Estrategia:
--   • Para cada día del año vigente se traen:
--       - hl_real (ventas_diarias agregadas) o hl_2025 si es histórico
--       - pct_rechazo_hl (rechazos / hl_real)
--       - pct_ausentismo (de pc_ausentismo_mensual.mes)
--   • Score = w_vol·(hl/p90) + w_otif·rechazo + w_aus·ausentismo
--   • Nivel:
--       score >= umbral_alto  → ALTO
--       score >= umbral_medio → MEDIO
--       resto                 → BAJO
--   • Domingo (extract dow=0) se fuerza nivel='BAJO' y score=0 (no hay reparto).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pc_calendario_dia AS
WITH cfg AS (
  SELECT
    anio_vigente, w_vol, w_otif, w_aus,
    umbral_alto, umbral_medio,
    COALESCE(NULLIF(hl_p90_2025, 0), 1) AS hl_p90  -- evita div/0 si no se cargó histórico aún
  FROM pc_config WHERE id = 1
),
fechas AS (
  SELECT generate_series(
    make_date((SELECT anio_vigente FROM cfg), 1, 1),
    make_date((SELECT anio_vigente FROM cfg), 12, 31),
    interval '1 day'
  )::date AS fecha
),
ventas_dia AS (
  SELECT fecha,
         SUM(total_hl)::numeric AS hl_real,
         COUNT(DISTINCT ds_fletero_carga) AS camiones
  FROM ventas_diarias
  WHERE fecha >= make_date((SELECT anio_vigente FROM cfg), 1, 1)
    AND fecha <= make_date((SELECT anio_vigente FROM cfg), 12, 31)
  GROUP BY fecha
),
rech_dia AS (
  SELECT fecha, SUM(hl_rechazados)::numeric AS hl_rech
  FROM rechazos
  WHERE fecha >= make_date((SELECT anio_vigente FROM cfg), 1, 1)
    AND fecha <= make_date((SELECT anio_vigente FROM cfg), 12, 31)
  GROUP BY fecha
),
crudo AS (
  SELECT
    f.fecha,
    EXTRACT(dow FROM f.fecha)::int AS dow,
    EXTRACT(month FROM f.fecha)::int AS mes,
    -- Si el año vigente es 2025 se usa el histórico seedeado; si no, los datos vivos
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.hl_total, 0) ELSE COALESCE(v.hl_real, 0) END AS hl,
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.hl_rechazo, 0) ELSE COALESCE(r.hl_rech, 0) END AS hl_rechazo,
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.camiones, 0) ELSE COALESCE(v.camiones, 0) END AS camiones,
    COALESCE(a.pct_ausentismo, 0)::numeric AS pct_ausentismo,
    fer.nombre AS nombre_feriado
  FROM fechas f
  LEFT JOIN ventas_dia v ON v.fecha = f.fecha
  LEFT JOIN rech_dia   r ON r.fecha = f.fecha
  LEFT JOIN pc_volumen_historico_2025 h ON h.fecha = f.fecha
  LEFT JOIN pc_ausentismo_mensual a
    ON a.anio = EXTRACT(year FROM f.fecha)::int
   AND a.mes  = EXTRACT(month FROM f.fecha)::int
  LEFT JOIN pc_feriados fer ON fer.fecha = f.fecha
),
scored AS (
  SELECT
    c.*,
    CASE WHEN c.hl > 0 THEN LEAST(1.0, (c.hl_rechazo / c.hl))::numeric ELSE 0 END AS pct_rechazo,
    -- score = w_vol·volumen_norm + w_otif·rechazo + w_aus·ausentismo
    CASE WHEN c.dow = 0 THEN 0::numeric
         ELSE LEAST(2.0, (
              (SELECT w_vol  FROM cfg) * (c.hl / (SELECT hl_p90 FROM cfg))
            + (SELECT w_otif FROM cfg) * CASE WHEN c.hl > 0 THEN LEAST(1.0, c.hl_rechazo / c.hl) ELSE 0 END
            + (SELECT w_aus  FROM cfg) * c.pct_ausentismo
         ))::numeric
    END AS score
  FROM crudo c
)
SELECT
  s.fecha,
  s.dow,
  CASE s.dow
    WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes'
    WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes'
    WHEN 6 THEN 'Sábado'
  END AS dia_semana,
  s.mes,
  s.hl,
  s.hl_rechazo,
  s.camiones,
  s.pct_rechazo,
  s.pct_ausentismo,
  s.nombre_feriado IS NOT NULL AS es_feriado,
  s.nombre_feriado,
  s.score,
  CASE
    WHEN s.dow = 0                                    THEN 'BAJO'
    WHEN s.score >= (SELECT umbral_alto  FROM cfg)    THEN 'ALTO'
    WHEN s.score >= (SELECT umbral_medio FROM cfg)    THEN 'MEDIO'
    ELSE                                                   'BAJO'
  END AS nivel
FROM scored s
ORDER BY s.fecha;

-- ---------------------------------------------------------------------------
-- 7. RLS — lectura amplia (mostrar el calendario al equipo de Planeamiento).
--          Escritura restringida a admin / admin_rrhh / supervisor.
-- ---------------------------------------------------------------------------
ALTER TABLE pc_volumen_historico_2025 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_ausentismo_mensual     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_feriados               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_config                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_escenarios             ENABLE ROW LEVEL SECURITY;

-- pc_volumen_historico_2025
DROP POLICY IF EXISTS "pc_volumen_historico_2025_read"  ON pc_volumen_historico_2025;
CREATE POLICY "pc_volumen_historico_2025_read"
  ON pc_volumen_historico_2025 FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_volumen_historico_2025_write" ON pc_volumen_historico_2025;
CREATE POLICY "pc_volumen_historico_2025_write"
  ON pc_volumen_historico_2025 FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- pc_ausentismo_mensual
DROP POLICY IF EXISTS "pc_ausentismo_mensual_read"  ON pc_ausentismo_mensual;
CREATE POLICY "pc_ausentismo_mensual_read"
  ON pc_ausentismo_mensual FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_ausentismo_mensual_write" ON pc_ausentismo_mensual;
CREATE POLICY "pc_ausentismo_mensual_write"
  ON pc_ausentismo_mensual FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- pc_feriados
DROP POLICY IF EXISTS "pc_feriados_read"  ON pc_feriados;
CREATE POLICY "pc_feriados_read"
  ON pc_feriados FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_feriados_write" ON pc_feriados;
CREATE POLICY "pc_feriados_write"
  ON pc_feriados FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- pc_config
DROP POLICY IF EXISTS "pc_config_read"  ON pc_config;
CREATE POLICY "pc_config_read"
  ON pc_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_config_write" ON pc_config;
CREATE POLICY "pc_config_write"
  ON pc_config FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- pc_escenarios
DROP POLICY IF EXISTS "pc_escenarios_read"  ON pc_escenarios;
CREATE POLICY "pc_escenarios_read"
  ON pc_escenarios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_escenarios_write" ON pc_escenarios;
CREATE POLICY "pc_escenarios_write"
  ON pc_escenarios FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));
