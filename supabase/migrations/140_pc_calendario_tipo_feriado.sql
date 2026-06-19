-- =============================================
-- Períodos Críticos — exponer el TIPO de feriado en la vista multi-año
--
-- Agrega `tipo_feriado` (nacional | provincial | empresa) a
-- v_pc_calendario_dia_multianio. Lo usa la detección de períodos para fijar los
-- EVENTOS DE EMPRESA (ej. Expoagro): esos días siempre integran un período
-- sugerido aunque no crucen el umbral de variables, así no dependen del filtro.
--
-- Conserva la lógica de Pampeana (volumen = bultos_distribuidos, otif_distribuido,
-- ausentismo diario, código 'P'); sólo agrega una columna al final.
-- =============================================
CREATE OR REPLACE VIEW v_pc_calendario_dia_multianio AS
WITH cfg AS (
  SELECT c.w_vol, c.w_otif, c.w_aus,
    c.umbral_alto AS umbral_score_alto, c.umbral_medio AS umbral_score_medio,
    COALESCE(NULLIF(c.hl_p90_2025, 0::numeric), 1::numeric) AS hl_p90,
    u.vol_pico, u.vol_alto, u.vol_medio, u.clientes AS umbral_clientes,
    u.otif_min, u.ausentismo_max, u.min_triggers
  FROM pc_config c CROSS JOIN pc_umbrales u
  WHERE c.id = 1 AND u.id = 1
), anios AS (
  SELECT generate_series(2024, EXTRACT(year FROM CURRENT_DATE)::integer + 1) AS anio
), fechas AS (
  SELECT a.anio,
    generate_series(make_date(a.anio,1,1)::timestamptz, make_date(a.anio,12,31)::timestamptz, '1 day'::interval)::date AS fecha
  FROM anios a
), ventas_dia AS (
  SELECT ventas_diarias.fecha, sum(ventas_diarias.total_hl) AS hl_real,
    count(DISTINCT ventas_diarias.ds_fletero_carga) AS camiones
  FROM ventas_diarias GROUP BY ventas_diarias.fecha
), rech_dia AS (
  SELECT rechazos.fecha, sum(rechazos.hl_rechazados) AS hl_rech,
    sum(rechazos.bultos_rechazados) AS br, sum(rechazos.bultos_entregados) AS be
  FROM rechazos GROUP BY rechazos.fecha
), crudo AS (
  SELECT f.anio, f.fecha,
    EXTRACT(dow FROM f.fecha)::integer AS dow,
    EXTRACT(month FROM f.fecha)::integer AS mes,
    COALESCE(h.bultos_distribuidos, v.hl_real, 0::numeric) AS hl,
    COALESCE(h.hl_rechazo, r.hl_rech, 0::numeric) AS hl_rechazo,
    COALESCE(NULLIF(h.camiones, 0)::bigint, v.camiones, 0::bigint)::integer AS camiones,
    COALESCE(h.clientes_distribuidos, 0) AS clientes_dia,
    COALESCE(h.otif_distribuido, CASE WHEN r.be > 0::numeric THEN 1.0 - r.br / r.be ELSE NULL::numeric END) AS otif_dist,
    COALESCE(ad.pct_ausentismo, au.pct_ausentismo, 0::numeric) AS pct_ausentismo,
    fer.nombre AS nombre_feriado,
    fer.tipo AS tipo_feriado
  FROM fechas f
    LEFT JOIN pc_volumen_diario h ON h.fecha = f.fecha
    LEFT JOIN ventas_dia v ON v.fecha = f.fecha
    LEFT JOIN rech_dia r ON r.fecha = f.fecha
    LEFT JOIN pc_ausentismo_diario ad ON ad.fecha = f.fecha
    LEFT JOIN pc_ausentismo_mensual au ON au.anio = f.anio AND au.mes = EXTRACT(month FROM f.fecha)::integer
    LEFT JOIN pc_feriados fer ON fer.fecha = f.fecha
), calc AS (
  SELECT c.anio, c.fecha, c.dow, c.mes, c.hl, c.hl_rechazo, c.camiones, c.clientes_dia,
    c.otif_dist, c.pct_ausentismo, c.nombre_feriado, c.tipo_feriado,
    1::numeric - COALESCE(c.otif_dist, 1.0) AS pct_rechazo,
    COALESCE(c.otif_dist, 1.0) AS otif_estimado,
    CASE
      WHEN c.hl >= (SELECT cfg.vol_pico FROM cfg) THEN 'PICO'::text
      WHEN c.hl >= (SELECT cfg.vol_alto FROM cfg) THEN 'ALTO'::text
      WHEN c.hl >= (SELECT cfg.vol_medio FROM cfg) THEN 'MEDIO'::text
      ELSE 'BAJO'::text
    END AS clasif_vol
  FROM crudo c
), triggers AS (
  SELECT c.anio, c.fecha, c.dow, c.mes, c.hl, c.hl_rechazo, c.camiones, c.clientes_dia,
    c.otif_dist, c.pct_ausentismo, c.nombre_feriado, c.tipo_feriado, c.pct_rechazo, c.otif_estimado, c.clasif_vol,
    c.clasif_vol = 'PICO'::text AS trigger_vol,
    c.clientes_dia > (SELECT cfg.umbral_clientes FROM cfg) AS trigger_cli,
    c.otif_dist IS NOT NULL AND c.otif_dist < (SELECT cfg.otif_min FROM cfg) AS trigger_otif,
    c.pct_ausentismo >= (SELECT cfg.ausentismo_max FROM cfg) AS trigger_aus
  FROM calc c
), final AS (
  SELECT t.anio, t.fecha, t.dow, t.mes, t.hl, t.hl_rechazo, t.camiones, t.clientes_dia,
    t.otif_dist, t.pct_ausentismo, t.nombre_feriado, t.tipo_feriado, t.pct_rechazo, t.otif_estimado, t.clasif_vol,
    t.trigger_vol, t.trigger_cli, t.trigger_otif, t.trigger_aus,
    ((CASE WHEN t.trigger_otif THEN 'P'::text ELSE ''::text END ||
      CASE WHEN t.trigger_vol THEN 'P'::text ELSE ''::text END) ||
      CASE WHEN t.trigger_cli THEN 'P'::text ELSE ''::text END) ||
      CASE WHEN t.trigger_aus THEN 'P'::text ELSE ''::text END AS codigo,
    CASE WHEN t.trigger_otif THEN 1 ELSE 0 END + CASE WHEN t.trigger_vol THEN 1 ELSE 0 END
      + CASE WHEN t.trigger_cli THEN 1 ELSE 0 END + CASE WHEN t.trigger_aus THEN 1 ELSE 0 END AS trigger_count
  FROM triggers t
), scored AS (
  SELECT f.anio, f.fecha, f.dow, f.mes, f.hl, f.hl_rechazo, f.camiones, f.clientes_dia,
    f.otif_dist, f.pct_ausentismo, f.nombre_feriado, f.tipo_feriado, f.pct_rechazo, f.otif_estimado, f.clasif_vol,
    f.trigger_vol, f.trigger_cli, f.trigger_otif, f.trigger_aus, f.codigo, f.trigger_count,
    CASE WHEN f.dow = 0 THEN 0::numeric
      ELSE LEAST(2.0, (SELECT cfg.w_vol FROM cfg) * (f.hl / (SELECT cfg.hl_p90 FROM cfg))
        + (SELECT cfg.w_otif FROM cfg) * f.pct_rechazo
        + (SELECT cfg.w_aus FROM cfg) * f.pct_ausentismo)
    END AS score
  FROM final f
)
SELECT anio, fecha, dow,
  CASE dow
    WHEN 0 THEN 'Domingo'::text WHEN 1 THEN 'Lunes'::text WHEN 2 THEN 'Martes'::text
    WHEN 3 THEN 'Miércoles'::text WHEN 4 THEN 'Jueves'::text WHEN 5 THEN 'Viernes'::text
    WHEN 6 THEN 'Sábado'::text ELSE NULL::text
  END AS dia_semana,
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado, pct_ausentismo, clasif_vol,
  nombre_feriado IS NOT NULL AS es_feriado, nombre_feriado, score,
  trigger_vol, trigger_cli, trigger_otif, trigger_aus, trigger_count, codigo,
  CASE WHEN dow = 0 THEN 'NORMAL'::text
    WHEN trigger_count >= (SELECT cfg.min_triggers FROM cfg) THEN 'CRITICO'::text
    ELSE 'NORMAL'::text
  END AS estatus,
  CASE WHEN dow = 0 THEN 'BAJO'::text
    WHEN trigger_count < (SELECT cfg.min_triggers FROM cfg) THEN 'BAJO'::text
    WHEN trigger_count >= 3 THEN 'ALTO'::text
    ELSE 'MEDIO'::text
  END AS nivel,
  tipo_feriado
FROM scored
ORDER BY anio, fecha;
