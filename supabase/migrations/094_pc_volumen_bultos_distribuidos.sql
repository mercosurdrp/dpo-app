-- =============================================
-- 094 · Períodos Críticos — volumen = BULTOS DISTRIBUIDOS (Foxtrot)
-- =============================================
-- Cambia la fuente del volumen: en vez del HL facturado (Chess/GESCOM, que
-- incluye mostrador/mayorista/refuerzo), se usa lo realmente ENTREGADO por
-- distribución según Foxtrot (Iguazú + Eldorado juntos, solo entregas
-- SUCCESSFUL), en BULTOS. La columna pc_volumen_diario.bultos_distribuidos la
-- llena el sync de Foxtrot (scripts/sync_foxtrot_bultos). El campo `hl` de la
-- vista pasa a representar BULTOS (el front lo rotula "bultos").
--
-- Clasificación de volumen en bultos/día: PICO > 3200 · ALTO 3000-3200 ·
-- MEDIO 2600-3000 · BAJO < 2600.
-- Idempotente. NOTIFY pgrst al final.
-- =============================================

BEGIN;

-- Columna (ya creada a mano el 2026-06-02; idempotente por las dudas)
ALTER TABLE pc_volumen_diario
  ADD COLUMN IF NOT EXISTS bultos_distribuidos NUMERIC(12,2);

-- Nuevos targets de volumen, ahora en bultos/día
UPDATE pc_umbrales
   SET vol_pico = 3200, vol_alto = 3000, vol_medio = 2600
 WHERE id = 1;

-- Vista multi-año: `hl` ahora = bultos_distribuidos (resto idéntico a mig 087)
CREATE OR REPLACE VIEW v_pc_calendario_dia_multianio AS
WITH cfg AS (
  SELECT c.w_vol, c.w_otif, c.w_aus,
    c.umbral_alto AS umbral_score_alto, c.umbral_medio AS umbral_score_medio,
    COALESCE(NULLIF(c.hl_p90_2025, 0), 1) AS hl_p90,
    u.vol_pico, u.vol_alto, u.vol_medio, u.clientes AS umbral_clientes,
    u.otif_min, u.ausentismo_max, u.min_triggers
  FROM pc_config c CROSS JOIN pc_umbrales u WHERE c.id = 1 AND u.id = 1),
anios AS (SELECT generate_series(2024, EXTRACT(year FROM CURRENT_DATE)::int + 1) AS anio),
fechas AS (SELECT a.anio, generate_series(make_date(a.anio,1,1), make_date(a.anio,12,31), interval '1 day')::date AS fecha FROM anios a),
ventas_dia AS (SELECT fecha, SUM(total_hl)::numeric AS hl_real, COUNT(DISTINCT ds_fletero_carga) AS camiones FROM ventas_diarias GROUP BY fecha),
rech_dia AS (SELECT fecha, SUM(hl_rechazados)::numeric AS hl_rech FROM rechazos GROUP BY fecha),
crudo AS (SELECT f.anio, f.fecha, EXTRACT(dow FROM f.fecha)::int AS dow, EXTRACT(month FROM f.fecha)::int AS mes,
  COALESCE(h.bultos_distribuidos, 0)::numeric AS hl,
  COALESCE(h.hl_rechazo, r.hl_rech, 0)::numeric AS hl_rechazo,
  COALESCE(NULLIF(h.camiones, 0), v.camiones, 0)::int AS camiones,
  COALESCE(NULLIF(h.clientes_dia, 0), 0)::int AS clientes_dia,
  COALESCE(au.pct_ausentismo, 0)::numeric AS pct_ausentismo,
  fer.nombre AS nombre_feriado
  FROM fechas f
  LEFT JOIN pc_volumen_diario h ON h.fecha = f.fecha
  LEFT JOIN ventas_dia v ON v.fecha = f.fecha
  LEFT JOIN rech_dia r ON r.fecha = f.fecha
  LEFT JOIN pc_ausentismo_mensual au ON au.anio = f.anio AND au.mes = EXTRACT(month FROM f.fecha)::int
  LEFT JOIN pc_feriados fer ON fer.fecha = f.fecha),
calc AS (SELECT c.*,
  CASE WHEN c.hl > 0 THEN LEAST(1.0, c.hl_rechazo / c.hl)::numeric ELSE 0 END AS pct_rechazo,
  CASE WHEN c.hl > 0 THEN GREATEST(0.0, 1 - (c.hl_rechazo / c.hl))::numeric ELSE 1 END AS otif_estimado,
  CASE WHEN c.hl >= (SELECT vol_pico FROM cfg) THEN 'PICO'
       WHEN c.hl >= (SELECT vol_alto FROM cfg) THEN 'ALTO'
       WHEN c.hl >= (SELECT vol_medio FROM cfg) THEN 'MEDIO' ELSE 'BAJO' END AS clasif_vol
  FROM crudo c),
triggers AS (SELECT c.*,
  (c.clasif_vol = 'PICO') AS trigger_vol,
  (c.clientes_dia > (SELECT umbral_clientes FROM cfg)) AS trigger_cli,
  (c.hl > 0 AND c.otif_estimado < (SELECT otif_min FROM cfg)) AS trigger_otif,
  (c.pct_ausentismo >= (SELECT ausentismo_max FROM cfg)) AS trigger_aus
  FROM calc c),
final AS (SELECT t.*,
  (CASE WHEN t.trigger_otif THEN 'P' ELSE '' END)
    || (CASE WHEN t.trigger_vol THEN 'P' ELSE '' END)
    || (CASE WHEN t.trigger_cli THEN 'P' ELSE '' END)
    || (CASE WHEN t.trigger_aus THEN 'P' ELSE '' END) AS codigo,
  (CASE WHEN t.trigger_otif THEN 1 ELSE 0 END
   + CASE WHEN t.trigger_vol THEN 1 ELSE 0 END
   + CASE WHEN t.trigger_cli THEN 1 ELSE 0 END
   + CASE WHEN t.trigger_aus THEN 1 ELSE 0 END) AS trigger_count
  FROM triggers t),
scored AS (SELECT f.*,
  CASE WHEN f.dow = 0 THEN 0::numeric
    ELSE LEAST(2.0, ((SELECT w_vol FROM cfg)*(f.hl/(SELECT hl_p90 FROM cfg)) + (SELECT w_otif FROM cfg)*f.pct_rechazo + (SELECT w_aus FROM cfg)*f.pct_ausentismo))::numeric END AS score
  FROM final f)
SELECT s.anio, s.fecha, s.dow,
  CASE s.dow WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes'
    WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sábado' END AS dia_semana,
  s.mes, s.hl, s.hl_rechazo, s.camiones, s.clientes_dia, s.pct_rechazo, s.otif_estimado, s.pct_ausentismo, s.clasif_vol,
  s.nombre_feriado IS NOT NULL AS es_feriado, s.nombre_feriado, s.score,
  s.trigger_vol, s.trigger_cli, s.trigger_otif, s.trigger_aus, s.trigger_count, s.codigo,
  CASE WHEN s.dow = 0 THEN 'NORMAL'
       WHEN s.trigger_count >= (SELECT min_triggers FROM cfg) THEN 'CRITICO'
       ELSE 'NORMAL' END AS estatus,
  CASE WHEN s.dow = 0 THEN 'BAJO'
       WHEN s.score >= (SELECT umbral_score_alto FROM cfg) THEN 'ALTO'
       WHEN s.score >= (SELECT umbral_score_medio FROM cfg) THEN 'MEDIO'
       ELSE 'BAJO' END AS nivel
FROM scored s ORDER BY s.anio, s.fecha;

COMMIT;

NOTIFY pgrst, 'reload schema';
