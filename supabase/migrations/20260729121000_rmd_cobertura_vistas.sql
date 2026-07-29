-- =============================================
-- RMD · Cobertura de encuestas (enviadas vs puntuadas)
-- =============================================
-- Vistas que alimentan la solapa "Cobertura" de /rmd:
--   v_rmd_cobertura_mensual  · enviadas vs puntuadas y tasa por mes de ENTREGA
--   v_rmd_cobertura_cliente  · una fila por cliente/año, con segmento y volumen
--   v_rmd_cobertura_vehiculo · enviadas/puntuadas por patente y día, para poder
--                              resolver el chofer fecha-aware desde la app
--
-- Todo se corta por FECHA DE ENTREGA (no por fecha de puntuación): la pregunta
-- es qué proporción de las entregas quedó sin calificar.
--
-- 🚨 La puntuación llega DESPUÉS de la entrega (mediana 4 días, p90 12, tope
-- ~30). Un mes con entregas recientes todavía va a sumar puntuaciones: la vista
-- lo marca `parcial` mientras su último día esté a menos de 15 días de hoy, y
-- la UI lo deja fuera de los totales. Es al revés que el NPS, donde el mes en
-- curso EXAGERA la tasa; acá la SUBESTIMA.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- ---------------------------------------------------------------
-- Mensual: el denominador real de la tasa de respuesta
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW v_rmd_cobertura_mensual
WITH (security_invoker = on) AS
SELECT
  extract(year  FROM fecha_entrega)::int AS anio,
  extract(month FROM fecha_entrega)::int AS mes,
  count(*)::int                                        AS enviadas,
  count(*) FILTER (WHERE puntuada)::int                AS puntuadas,
  CASE WHEN count(*) > 0
       THEN round(100.0 * count(*) FILTER (WHERE puntuada) / count(*), 1)
  END AS tasa_respuesta,
  round(avg(puntuacion) FILTER (WHERE puntuada), 2)    AS rmd,
  count(*) FILTER (WHERE puntuada AND puntuacion <= 3)::int AS bajas,
  -- todavía puede recibir puntuaciones ⇒ la tasa está subestimada
  (max(fecha_entrega) > current_date - 15) AS parcial
FROM rmd_envios
WHERE fecha_entrega IS NOT NULL
GROUP BY 1, 2;

-- ---------------------------------------------------------------
-- Cliente: historia de participación + segmento accionable + volumen
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW v_rmd_cobertura_cliente
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    cod_cliente,
    extract(year FROM fecha_entrega)::int AS anio,
    count(*)::int                         AS enviadas,
    count(*) FILTER (WHERE puntuada)::int AS puntuadas,
    max(fecha_entrega) FILTER (WHERE puntuada) AS ult_fecha_punt,
    (array_agg(puntuacion ORDER BY fecha_entrega DESC)
       FILTER (WHERE puntuada))[1]        AS ult_puntuacion,
    round(avg(puntuacion) FILTER (WHERE puntuada), 2) AS rmd,
    count(*) FILTER (WHERE puntuada AND puntuacion <= 3)::int AS bajas,
    max(nombre_cliente) AS nombre_cliente,
    max(promotor)       AS promotor,
    max(localidad)      AS localidad,
    max(fecha_entrega)  AS ult_fecha_envio
  FROM rmd_envios
  WHERE fecha_entrega IS NOT NULL
  GROUP BY 1, 2
), ignoradas AS (
  -- entregas encuestadas DESPUÉS de la última que el cliente puntuó
  SELECT e.cod_cliente,
         extract(year FROM e.fecha_entrega)::int AS anio,
         count(*)::int AS envios_ignorados
  FROM rmd_envios e
  JOIN base b ON b.cod_cliente = e.cod_cliente
             AND b.anio = extract(year FROM e.fecha_entrega)::int
  WHERE NOT e.puntuada
    AND e.fecha_entrega > coalesce(b.ult_fecha_punt, '1900-01-01'::date)
  GROUP BY 1, 2
), vol AS (
  SELECT id_cliente, extract(year FROM fecha)::int AS anio,
         sum(hl) AS hl, sum(monto_neto) AS monto_neto
  FROM ventas_diarias_cliente GROUP BY 1, 2
)
SELECT
  b.cod_cliente,
  b.anio,
  b.nombre_cliente,
  b.promotor,
  b.localidad,
  b.enviadas,
  b.puntuadas,
  coalesce(i.envios_ignorados, 0) AS envios_ignorados,
  CASE WHEN b.enviadas > 0
       THEN round(100.0 * b.puntuadas / b.enviadas, 1)
  END AS tasa_respuesta,
  b.rmd,
  b.bajas,
  b.ult_fecha_punt  AS ultima_puntuacion_fecha,
  b.ult_puntuacion  AS ultima_puntuacion,
  b.ult_fecha_envio AS ultima_entrega,
  round(coalesce(v.hl, 0), 1)      AS hl_anio,
  round(coalesce(v.monto_neto, 0)) AS monto_anio,
  -- 🚨 Los cortes están calibrados con la tasa real (~45 %): que alguien no
  -- puntúe UNA entrega es lo normal, no una señal. Por eso "dejó de puntuar"
  -- pide 4 entregas seguidas sin calificar (~9 % de probabilidad si nada
  -- cambió) y "nunca puntuó" pide 3 encuestas (~17 %).
  CASE
    WHEN b.ult_puntuacion <= 3 AND coalesce(i.envios_ignorados, 0) > 0 THEN 'queja_abierta'
    WHEN b.ult_puntuacion >= 4 AND coalesce(i.envios_ignorados, 0) >= 4 THEN 'dejo_de_puntuar'
    WHEN b.puntuadas = 0 AND b.enviadas >= 3 THEN 'nunca_puntuo'
    WHEN b.puntuadas > 0 AND b.enviadas >= 5
         AND 100.0 * b.puntuadas / b.enviadas < 20 THEN 'baja_participacion'
    WHEN b.puntuadas = 0 THEN 'pocos_envios'
    ELSE 'puntuando'
  END AS segmento,
  CASE
    WHEN b.ult_puntuacion <= 3 AND coalesce(i.envios_ignorados, 0) > 0 THEN 1
    WHEN b.ult_puntuacion >= 4 AND coalesce(i.envios_ignorados, 0) >= 4 THEN 2
    WHEN b.puntuadas = 0 AND b.enviadas >= 3 THEN 3
    WHEN b.puntuadas > 0 AND b.enviadas >= 5
         AND 100.0 * b.puntuadas / b.enviadas < 20 THEN 4
    WHEN b.puntuadas = 0 THEN 5
    ELSE 6
  END AS prioridad
FROM base b
LEFT JOIN ignoradas i ON i.cod_cliente = b.cod_cliente AND i.anio = b.anio
LEFT JOIN vol       v ON v.id_cliente  = b.cod_cliente AND v.anio = b.anio;

-- ---------------------------------------------------------------
-- Vehículo × día: para ver a qué camión no le califican las entregas
-- ---------------------------------------------------------------
-- Grano día porque el chofer de un camión cambia según la jornada y se resuelve
-- por (patente + fecha) contra el TML/check de ese día, ya en la app. La
-- localidad no se abre: solo interesa si tocó Pergamino, que es la regla de
-- desempate de OJA403 (la patente que no carga TML).
CREATE OR REPLACE VIEW v_rmd_cobertura_vehiculo
WITH (security_invoker = on) AS
SELECT
  extract(year FROM fecha_entrega)::int AS anio,
  vehiculo_entrega,
  fecha_entrega,
  bool_or(upper(coalesce(localidad, '')) LIKE '%PERGAMINO%') AS pergamino,
  count(*)::int                         AS enviadas,
  count(*) FILTER (WHERE puntuada)::int AS puntuadas,
  sum(puntuacion) FILTER (WHERE puntuada)::int AS suma_puntuacion,
  count(*) FILTER (WHERE puntuada AND puntuacion <= 3)::int AS bajas
FROM rmd_envios
WHERE fecha_entrega IS NOT NULL AND vehiculo_entrega IS NOT NULL
GROUP BY 1, 2, 3;

GRANT SELECT ON v_rmd_cobertura_mensual,
               v_rmd_cobertura_cliente,
               v_rmd_cobertura_vehiculo TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
