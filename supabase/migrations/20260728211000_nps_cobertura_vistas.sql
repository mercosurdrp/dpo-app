-- =============================================
-- NPS · Cobertura de encuestas (enviadas vs respondidas)
-- =============================================
-- Vistas que alimentan la solapa "Cobertura" de /nps:
--   v_nps_cobertura_mensual  · enviadas vs respondidas y tasa por mes
--   v_nps_cobertura_cliente  · una fila por cliente/año, con segmento y volumen
--   v_nps_cobertura_promotor · el mismo corte agregado por promotor
--
-- La verdad de "respondió" siempre sale de nps_encuestas; nps_envios solo
-- aporta el denominador (ver el comentario de la migración de nps_envios).
--
-- 🚨 El mes en curso viene incompleto del Power BI (carga las enviadas con
-- retraso ⇒ enviadas = respondidas ⇒ tasa 100 %). La vista marca esos meses
-- con `parcial = true` para que la UI los excluya de los promedios.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- ---------------------------------------------------------------
-- Mensual: el denominador real de la tasa de respuesta
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW v_nps_cobertura_mensual
WITH (security_invoker = on) AS
WITH env AS (
  SELECT anio, mes, sum(enviadas)::int AS enviadas
  FROM nps_envios GROUP BY 1, 2
), resp AS (
  SELECT extract(year  FROM fecha_enc)::int AS anio,
         extract(month FROM fecha_enc)::int AS mes,
         count(*)::int AS respondidas
  FROM nps_encuestas GROUP BY 1, 2
)
SELECT
  coalesce(e.anio, r.anio) AS anio,
  coalesce(e.mes,  r.mes)  AS mes,
  coalesce(e.enviadas, 0)  AS enviadas,
  coalesce(r.respondidas, 0) AS respondidas,
  CASE WHEN coalesce(e.enviadas, 0) > 0
       THEN round(100.0 * coalesce(r.respondidas, 0) / e.enviadas, 1)
  END AS tasa_respuesta,
  -- mes en curso = todavía no cargó la base de enviadas
  (coalesce(e.anio, r.anio) = extract(year FROM current_date)::int
   AND coalesce(e.mes, r.mes) >= extract(month FROM current_date)::int) AS parcial
FROM env e
FULL JOIN resp r ON r.anio = e.anio AND r.mes = e.mes;

-- ---------------------------------------------------------------
-- Cliente: historia de respuesta + segmento accionable + volumen
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW v_nps_cobertura_cliente
WITH (security_invoker = on) AS
WITH resp AS (
  SELECT cod_cliente,
         extract(year FROM fecha_enc)::int AS anio,
         count(*)::int AS respondidas,
         max(fecha_enc) AS ult_fecha,
         max(extract(month FROM fecha_enc)::int) AS ult_mes,
         (array_agg(categoria ORDER BY fecha_enc DESC))[1] AS ult_categoria,
         (array_agg(score     ORDER BY fecha_enc DESC))[1] AS ult_score,
         (array_agg(comentario ORDER BY fecha_enc DESC) FILTER (WHERE comentario IS NOT NULL))[1] AS ult_comentario
  FROM nps_encuestas GROUP BY 1, 2
), env AS (
  SELECT e.cod_cliente, e.anio,
         sum(e.enviadas)::int AS enviadas,
         max(e.mes)::int AS ult_mes_envio,
         -- envíos posteriores a la última respuesta = las que ignoró
         count(*) FILTER (WHERE e.mes > coalesce(r.ult_mes, 0))::int AS envios_ignorados,
         max(e.nombre_cliente) AS nombre_cliente,
         max(e.promotor)  AS promotor,
         max(e.localidad) AS localidad
  FROM nps_envios e
  LEFT JOIN resp r ON r.cod_cliente = e.cod_cliente AND r.anio = e.anio
  GROUP BY 1, 2
), vol AS (
  SELECT id_cliente, extract(year FROM fecha)::int AS anio,
         sum(hl) AS hl, sum(monto_neto) AS monto_neto
  FROM ventas_diarias_cliente GROUP BY 1, 2
)
SELECT
  e.cod_cliente,
  e.anio,
  e.nombre_cliente,
  e.promotor,
  e.localidad,
  e.enviadas,
  coalesce(r.respondidas, 0) AS respondidas,
  e.envios_ignorados,
  CASE WHEN e.enviadas > 0
       THEN round(100.0 * coalesce(r.respondidas, 0) / e.enviadas, 1)
  END AS tasa_respuesta,
  r.ult_fecha      AS ultima_respuesta,
  r.ult_categoria  AS ultima_categoria,
  r.ult_score      AS ultimo_score,
  r.ult_comentario AS ultimo_comentario,
  round(coalesce(v.hl, 0), 1)      AS hl_anio,
  round(coalesce(v.monto_neto, 0)) AS monto_anio,
  CASE
    -- se quejó (o quedó tibio) y a la siguiente encuesta no contestó
    WHEN r.ult_categoria IN ('Detractor', 'Passive') AND e.envios_ignorados > 0 THEN 'queja_abierta'
    -- votaba bien y dejó de contestar
    WHEN r.ult_categoria = 'Promoter' AND e.envios_ignorados > 0 THEN 'promotor_apagado'
    -- nunca contestó pese a la insistencia
    WHEN coalesce(r.respondidas, 0) = 0 AND e.enviadas >= 2 THEN 'nunca_respondio'
    -- una sola encuesta y no contestó: poca evidencia todavía
    WHEN coalesce(r.respondidas, 0) = 0 THEN 'un_solo_envio'
    ELSE 'respondiendo'
  END AS segmento,
  CASE
    WHEN r.ult_categoria IN ('Detractor', 'Passive') AND e.envios_ignorados > 0 THEN 1
    WHEN r.ult_categoria = 'Promoter' AND e.envios_ignorados > 0 THEN 2
    WHEN coalesce(r.respondidas, 0) = 0 AND e.enviadas >= 2 THEN 3
    WHEN coalesce(r.respondidas, 0) = 0 THEN 4
    ELSE 5
  END AS prioridad
FROM env e
LEFT JOIN resp r ON r.cod_cliente = e.cod_cliente AND r.anio = e.anio
LEFT JOIN vol  v ON v.id_cliente  = e.cod_cliente AND v.anio = e.anio;

-- ---------------------------------------------------------------
-- Promotor: para repartir el trabajo por vendedor
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW v_nps_cobertura_promotor
WITH (security_invoker = on) AS
SELECT
  anio,
  coalesce(promotor, '(sin promotor)') AS promotor,
  count(*)::int          AS clientes,
  sum(enviadas)::int     AS enviadas,
  sum(respondidas)::int  AS respondidas,
  CASE WHEN sum(enviadas) > 0
       THEN round(100.0 * sum(respondidas) / sum(enviadas), 1)
  END AS tasa_respuesta,
  count(*) FILTER (WHERE segmento = 'queja_abierta')::int    AS queja_abierta,
  count(*) FILTER (WHERE segmento = 'promotor_apagado')::int AS promotor_apagado,
  count(*) FILTER (WHERE segmento = 'nunca_respondio')::int  AS nunca_respondio,
  round(sum(hl_anio) FILTER (WHERE segmento <> 'respondiendo'), 1) AS hl_sin_voz
FROM v_nps_cobertura_cliente
GROUP BY 1, 2;

GRANT SELECT ON v_nps_cobertura_mensual,
               v_nps_cobertura_cliente,
               v_nps_cobertura_promotor TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
