-- =============================================
-- Períodos Críticos v2 — modelo Mercosur (4 variables + triggers booleanos)
--
-- Reescribe la lógica para coincidir con la hoja "Criterio Asig" del Excel
-- "Calendario Días Pico MERCOSUR-2025":
--
--   • 4 variables: VOLUMEN (HL), CLIENTES, OTIF, AUSENTISMO
--   • Cada una gatilla "A" o "" según su umbral fijo (no percentiles)
--   • Código FINAL = concat de las 4 → "AAAA" / "AAA" / "AA" / "A" / ""
--   • ESTATUS = "CRITICO" si len(código) >= MIN_TRIGGERS, sino "NORMAL"
--   • Cada código tiene un Plan de Acción asociado (col O del Excel)
--
-- Cambios vs migración 083:
--   • pc_volumen_historico_2025 → renombrada a pc_volumen_diario (multi-año)
--     + columna clientes_dia
--   • Nueva pc_umbrales (1 fila) con los 6 umbrales editables
--   • Nueva pc_planes_accion (codigo → plan_texto)
--   • Vista v_pc_calendario_dia reescrita con triggers + código + estatus
--     (se mantiene el score continuo para el simulador)
--   • pc_config sigue existiendo (pesos del score), no se toca
-- =============================================

-- ---------------------------------------------------------------------------
-- 1. Renombrar tabla histórica y agregar columna #clientes
-- ---------------------------------------------------------------------------
-- DROP la vista vieja primero (depende de la tabla histórica)
DROP VIEW IF EXISTS v_pc_calendario_dia;

ALTER TABLE IF EXISTS pc_volumen_historico_2025 RENAME TO pc_volumen_diario;

-- Agregar columnas faltantes (idempotente)
ALTER TABLE pc_volumen_diario
  ADD COLUMN IF NOT EXISTS clientes_dia INT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Umbrales editables (1 sola fila, id=1)
--
-- Defaults pensados para Misiones diarios:
--   • Volumen pico   ≥ 800 HL   (top día 2026 ≈ 960)
--   • Volumen alto   ≥ 600 HL
--   • Volumen medio  ≥ 400 HL
--   • Clientes       ≥ 250 (umbral del Excel)
--   • OTIF mínimo    < 92% gatilla "A"
--   • Ausentismo     ≥ 7.5% gatilla "A"
--   • Min triggers   2 → "AA" o más = CRITICO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_umbrales (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vol_pico        NUMERIC(10,2) NOT NULL DEFAULT 800.00,
  vol_alto        NUMERIC(10,2) NOT NULL DEFAULT 600.00,
  vol_medio       NUMERIC(10,2) NOT NULL DEFAULT 400.00,
  clientes        INT           NOT NULL DEFAULT 250,
  otif_min        NUMERIC(4,3)  NOT NULL DEFAULT 0.920,
  ausentismo_max  NUMERIC(4,3)  NOT NULL DEFAULT 0.075,
  min_triggers    INT           NOT NULL DEFAULT 2 CHECK (min_triggers BETWEEN 1 AND 4),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CHECK (vol_pico >= vol_alto AND vol_alto >= vol_medio)
);

INSERT INTO pc_umbrales (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_pc_umbrales_updated_at ON pc_umbrales;
CREATE TRIGGER trg_pc_umbrales_updated_at
  BEFORE UPDATE ON pc_umbrales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Planes de acción por código (texto multilínea, editable desde la UI)
--
-- Los textos default vienen de la columna O del Excel modelo
-- (hoja "Criterio Asig", filas 3 y 13). "AAAA" tiene el plan más completo;
-- los demás códigos heredan un subset.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_planes_accion (
  codigo       TEXT PRIMARY KEY,
  descripcion  TEXT NOT NULL DEFAULT '',
  plan_texto   TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_pc_planes_accion_updated_at ON pc_planes_accion;
CREATE TRIGGER trg_pc_planes_accion_updated_at
  BEFORE UPDATE ON pc_planes_accion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO pc_planes_accion (codigo, descripcion, plan_texto) VALUES
  ('AAAA',
   'Crítico máximo: las 4 variables gatilladas',
   E'• Activar incentivo por asistencia (además del incentivo de verano)\n'
   '• Warehouse: soporte de un autoelevador adicional ante aumento significativo de volumen (Spot)\n'
   '• Si no se cubre el volumen solicitado, validar traslado de unidades entre Eldorado e Iguazú y viceversa\n'
   '• Iniciar proceso de convocatoria de personal para temporada Pico (Pilar Gente — Base de datos temporal)\n'
   '• Promover retiros de cliente en las instalaciones\n'
   '• Adelanto de pedidos para descomprimir rutas\n'
   '• Recorte de FDR priorizando entregas a clientes con ruta normal'),
  ('AAA',
   'Alta criticidad: 3 variables gatilladas',
   E'• Warehouse: soporte de un autoelevador adicional ante aumento significativo de volumen (Spot)\n'
   '• Validar traslado de unidades entre Eldorado e Iguazú y viceversa si el volumen no se cubre\n'
   '• Iniciar proceso de convocatoria de personal para temporada Pico\n'
   '• Promover retiros de cliente en las instalaciones\n'
   '• Adelanto de pedidos para descomprimir rutas'),
  ('AA',
   'Criticidad media: 2 variables gatilladas',
   E'• Reforzar dotación de reparto del día (rotar de zonas de menor demanda)\n'
   '• Carga anticipada del camión la noche previa\n'
   '• Preventa focalizada en clientes A del recorrido'),
  ('A',
   'Atención: 1 variable gatillada (no llega a crítico con umbral default)',
   E'• Monitorear el indicador gatillado durante el turno\n'
   '• Evaluar si la tendencia persiste para reforzar el día siguiente'),
  ('',
   'Día normal',
   '— Sin acciones extraordinarias —')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Vista del calendario con triggers + estatus
--
-- Cambios vs v1:
--   • Sumamos clientes_dia (4ta variable)
--   • Calculamos 4 triggers booleanos contra umbrales fijos
--   • Codigo = concat ordenado de las "A" (V/C/O/U para volumen/clientes/otif/aus)
--     Para coincidir con el Excel: orden OTIF-VOL-CLI-AUS (columnas I/J/K/L)
--     pero exponemos cada bool por separado para tooltip.
--   • Estatus = CRITICO si trigger_count >= min_triggers, sino NORMAL
--   • Mantenemos el score continuo (compat con simulador y con configuración de pesos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pc_calendario_dia AS
WITH cfg AS (
  SELECT
    c.anio_vigente, c.w_vol, c.w_otif, c.w_aus,
    c.umbral_alto AS umbral_score_alto, c.umbral_medio AS umbral_score_medio,
    COALESCE(NULLIF(c.hl_p90_2025, 0), 1) AS hl_p90,
    u.vol_pico, u.vol_alto, u.vol_medio,
    u.clientes AS umbral_clientes,
    u.otif_min, u.ausentismo_max, u.min_triggers
  FROM pc_config c CROSS JOIN pc_umbrales u
  WHERE c.id = 1 AND u.id = 1
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
  SELECT fecha,
         SUM(hl_rechazados)::numeric AS hl_rech,
         COUNT(DISTINCT id_cliente)   AS cli_rech
  FROM rechazos
  WHERE fecha >= make_date((SELECT anio_vigente FROM cfg), 1, 1)
    AND fecha <= make_date((SELECT anio_vigente FROM cfg), 12, 31)
  GROUP BY fecha
),
clientes_dia_dpoapp AS (
  -- Para 2026 (DB viva) los clientes únicos del día se aproximan con
  -- los que tuvieron alguna línea en rechazos. Es un proxy razonable
  -- porque cada planilla de carga genera una línea por cliente entregado.
  -- (Para 2025 esto viene precalculado en pc_volumen_diario desde el sync.)
  SELECT fecha, COUNT(DISTINCT id_cliente) AS clientes_dia
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
    -- Si el año vigente es 2025 los datos vienen del seed (pc_volumen_diario);
    -- para 2026 vienen vivos de ventas_diarias + rechazos + clientes_dia_dpoapp.
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.hl_total, 0) ELSE COALESCE(v.hl_real, 0) END AS hl,
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.hl_rechazo, 0) ELSE COALESCE(r.hl_rech, 0) END AS hl_rechazo,
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.camiones, 0) ELSE COALESCE(v.camiones, 0) END AS camiones,
    CASE WHEN (SELECT anio_vigente FROM cfg) = 2025
         THEN COALESCE(h.clientes_dia, 0) ELSE COALESCE(cd.clientes_dia, 0) END AS clientes_dia,
    COALESCE(a.pct_ausentismo, 0)::numeric AS pct_ausentismo,
    fer.nombre AS nombre_feriado
  FROM fechas f
  LEFT JOIN ventas_dia            v  ON v.fecha = f.fecha
  LEFT JOIN rech_dia              r  ON r.fecha = f.fecha
  LEFT JOIN pc_volumen_diario     h  ON h.fecha = f.fecha
  LEFT JOIN clientes_dia_dpoapp   cd ON cd.fecha = f.fecha
  LEFT JOIN pc_ausentismo_mensual a
    ON a.anio = EXTRACT(year  FROM f.fecha)::int
   AND a.mes  = EXTRACT(month FROM f.fecha)::int
  LEFT JOIN pc_feriados fer ON fer.fecha = f.fecha
),
calc AS (
  SELECT
    c.*,
    -- % rechazo HL (proxy OTIF invertido)
    CASE WHEN c.hl > 0 THEN LEAST(1.0, c.hl_rechazo / c.hl)::numeric ELSE 0 END AS pct_rechazo,
    -- OTIF estimado = 1 - %rechazo
    CASE WHEN c.hl > 0 THEN GREATEST(0.0, 1 - (c.hl_rechazo / c.hl))::numeric ELSE 1 END AS otif_estimado,
    -- Clasificación de volumen (PICO/ALTO/MEDIO/BAJO) — replica col F del Excel
    CASE
      WHEN c.hl >= (SELECT vol_pico  FROM cfg) THEN 'PICO'
      WHEN c.hl >= (SELECT vol_alto  FROM cfg) THEN 'ALTO'
      WHEN c.hl >= (SELECT vol_medio FROM cfg) THEN 'MEDIO'
      ELSE 'BAJO'
    END AS clasif_vol
  FROM crudo c
),
triggers AS (
  SELECT
    c.*,
    -- 4 triggers booleanos (true = gatilló)
    (c.clasif_vol = 'PICO')                              AS trigger_vol,
    (c.clientes_dia > (SELECT umbral_clientes FROM cfg)) AS trigger_cli,
    (c.otif_estimado < (SELECT otif_min FROM cfg))       AS trigger_otif,
    (c.pct_ausentismo >= (SELECT ausentismo_max FROM cfg)) AS trigger_aus
  FROM calc c
),
final AS (
  SELECT
    t.*,
    -- Código FINAL en el orden del Excel: OTIF | VOL | CLI | AUS (cols I/J/K/L)
    (CASE WHEN t.trigger_otif THEN 'A' ELSE '' END)
      || (CASE WHEN t.trigger_vol  THEN 'A' ELSE '' END)
      || (CASE WHEN t.trigger_cli  THEN 'A' ELSE '' END)
      || (CASE WHEN t.trigger_aus  THEN 'A' ELSE '' END) AS codigo,
    -- Cantidad de triggers activos
    (CASE WHEN t.trigger_otif THEN 1 ELSE 0 END
     + CASE WHEN t.trigger_vol  THEN 1 ELSE 0 END
     + CASE WHEN t.trigger_cli  THEN 1 ELSE 0 END
     + CASE WHEN t.trigger_aus  THEN 1 ELSE 0 END) AS trigger_count
  FROM triggers t
),
scored AS (
  -- Score continuo (mantenido para el simulador y compatibilidad).
  SELECT
    f.*,
    CASE WHEN f.dow = 0 THEN 0::numeric
         ELSE LEAST(2.0, (
              (SELECT w_vol  FROM cfg) * (f.hl / (SELECT hl_p90 FROM cfg))
            + (SELECT w_otif FROM cfg) * f.pct_rechazo
            + (SELECT w_aus  FROM cfg) * f.pct_ausentismo
         ))::numeric
    END AS score
  FROM final f
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
  s.clientes_dia,
  s.pct_rechazo,
  s.otif_estimado,
  s.pct_ausentismo,
  s.clasif_vol,
  s.nombre_feriado IS NOT NULL AS es_feriado,
  s.nombre_feriado,
  s.score,
  -- Triggers individuales (para tooltip)
  s.trigger_vol,
  s.trigger_cli,
  s.trigger_otif,
  s.trigger_aus,
  s.trigger_count,
  s.codigo,
  -- Estatus final
  CASE
    WHEN s.dow = 0                                            THEN 'NORMAL'
    WHEN s.trigger_count >= (SELECT min_triggers FROM cfg)    THEN 'CRITICO'
    ELSE                                                            'NORMAL'
  END AS estatus,
  -- Nivel compatibilidad con UI vieja (BAJO/MEDIO/ALTO) — derivado del score
  CASE
    WHEN s.dow = 0                                            THEN 'BAJO'
    WHEN s.score >= (SELECT umbral_score_alto  FROM cfg)      THEN 'ALTO'
    WHEN s.score >= (SELECT umbral_score_medio FROM cfg)      THEN 'MEDIO'
    ELSE                                                            'BAJO'
  END AS nivel
FROM scored s
ORDER BY s.fecha;

-- ---------------------------------------------------------------------------
-- 5. RLS para las tablas nuevas
-- ---------------------------------------------------------------------------
ALTER TABLE pc_umbrales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_planes_accion  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_umbrales_read"  ON pc_umbrales;
CREATE POLICY "pc_umbrales_read"
  ON pc_umbrales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_umbrales_write" ON pc_umbrales;
CREATE POLICY "pc_umbrales_write"
  ON pc_umbrales FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

DROP POLICY IF EXISTS "pc_planes_accion_read"  ON pc_planes_accion;
CREATE POLICY "pc_planes_accion_read"
  ON pc_planes_accion FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_planes_accion_write" ON pc_planes_accion;
CREATE POLICY "pc_planes_accion_write"
  ON pc_planes_accion FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- Renombrar policies viejas que apuntan a la tabla renombrada
DROP POLICY IF EXISTS "pc_volumen_historico_2025_read"  ON pc_volumen_diario;
DROP POLICY IF EXISTS "pc_volumen_historico_2025_write" ON pc_volumen_diario;
CREATE POLICY "pc_volumen_diario_read"
  ON pc_volumen_diario FOR SELECT TO authenticated USING (true);
CREATE POLICY "pc_volumen_diario_write"
  ON pc_volumen_diario FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));
