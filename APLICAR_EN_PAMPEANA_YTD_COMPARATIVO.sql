-- =============================================
-- YTD · Comparativo del año en curso contra el anterior, al mismo día
-- =============================================
-- Pedido de Fausto (17/09/2026): en /rmd y /nps, el acumulado del año hasta
-- hoy contra el acumulado del año pasado hasta la misma fecha.
--
-- El corte se hace por la MISMA CANTIDAD DE DÍAS CORRIDOS desde el 1/1 de cada
-- año (y no por día/mes calendario) para no tener que manejar el 29/02: la
-- diferencia es de un día como mucho en años bisiestos, irrelevante para la
-- comparación, y evita una fecha inválida.
--
-- Se resuelve con funciones agregadas y no leyendo las filas desde la app
-- porque son ~17.000 puntuaciones por año: traerlas al cliente para promediar
-- es justo lo que hacía lenta la app (ver INFORME_PERFORMANCE_2026-09-16.md).
--
-- 🚨 El histórico 2025 NO está en la base todavía: hasta que se cargue por el
-- buzón, las funciones devuelven la fila del año anterior en cero y la UI
-- muestra "sin datos del año anterior".
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- Día de corte: hoy en hora de Argentina (el server corre en UTC).
CREATE OR REPLACE FUNCTION ytd_dia_corte()
RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
$$;

-- ---------------------------------------------------------------
-- RMD: puntuación 1-5 de cada entrega. Detractor = 1-3, promotor = 5.
-- `puntuadas` y `rmd` se cortan por fecha de puntuación (cuándo respondió el
-- cliente). `enviadas` va por fecha de entrega, porque una encuesta sin
-- responder no tiene fecha de puntuación: por eso la tasa de respuesta es
-- aproximada y así se aclara en la pantalla.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION rmd_ytd_comparativo()
RETURNS TABLE (
  anio          int,
  puntuadas     bigint,
  rmd           numeric,
  detractores   bigint,
  promotores    bigint,
  enviadas      bigint
)
LANGUAGE sql STABLE
AS $$
  WITH hoy AS (
    SELECT ytd_dia_corte() AS d
  ),
  rangos AS (
    SELECT
      a AS anio,
      make_date(a, 1, 1) AS desde,
      make_date(a, 1, 1) + (d - make_date(EXTRACT(YEAR FROM d)::int, 1, 1)) AS hasta
    FROM hoy,
      LATERAL (VALUES (EXTRACT(YEAR FROM d)::int), (EXTRACT(YEAR FROM d)::int - 1)) AS v(a)
  )
  SELECT
    r.anio,
    COUNT(p.rating_id)                                             AS puntuadas,
    ROUND(AVG(p.puntuacion)::numeric, 2)                           AS rmd,
    COUNT(p.rating_id) FILTER (WHERE p.puntuacion <= 3)            AS detractores,
    COUNT(p.rating_id) FILTER (WHERE p.puntuacion = 5)             AS promotores,
    (
      SELECT COUNT(*)
      FROM rmd_envios e
      WHERE e.fecha_entrega >= r.desde
        AND e.fecha_entrega <= r.hasta
    )                                                              AS enviadas
  FROM rangos r
  LEFT JOIN nps_rmd_cliente p
    ON p.fecha_puntuacion >= r.desde
   AND p.fecha_puntuacion <= r.hasta
  GROUP BY r.anio, r.desde, r.hasta
  ORDER BY r.anio DESC
$$;

-- ---------------------------------------------------------------
-- NPS: encuesta BEES. La categoría (Promoter/Passive/Detractor) ya viene
-- resuelta del Power BI, así que se cuenta tal cual, y el NPS se calcula
-- igual que en la pantalla: (promotores - detractores) / total * 100.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION nps_ytd_comparativo()
RETURNS TABLE (
  anio          int,
  encuestas     bigint,
  promotores    bigint,
  pasivos       bigint,
  detractores   bigint,
  nps           numeric
)
LANGUAGE sql STABLE
AS $$
  WITH hoy AS (
    SELECT ytd_dia_corte() AS d
  ),
  rangos AS (
    SELECT
      a AS anio,
      make_date(a, 1, 1) AS desde,
      make_date(a, 1, 1) + (d - make_date(EXTRACT(YEAR FROM d)::int, 1, 1)) AS hasta
    FROM hoy,
      LATERAL (VALUES (EXTRACT(YEAR FROM d)::int), (EXTRACT(YEAR FROM d)::int - 1)) AS v(a)
  ),
  base AS (
    SELECT
      r.anio,
      COUNT(e.*)                                              AS encuestas,
      COUNT(e.*) FILTER (WHERE e.categoria = 'Promoter')      AS promotores,
      COUNT(e.*) FILTER (WHERE e.categoria = 'Passive')       AS pasivos,
      COUNT(e.*) FILTER (WHERE e.categoria = 'Detractor')     AS detractores
    FROM rangos r
    LEFT JOIN nps_encuestas e
      ON e.fecha_enc >= r.desde
     AND e.fecha_enc <  r.hasta + 1   -- fecha_enc es timestamp: incluye todo el día
    GROUP BY r.anio
  )
  SELECT
    anio,
    encuestas,
    promotores,
    pasivos,
    detractores,
    CASE
      WHEN encuestas > 0
        THEN ROUND(((promotores - detractores)::numeric / encuestas) * 100, 1)
      ELSE NULL
    END AS nps
  FROM base
  ORDER BY anio DESC
$$;

GRANT EXECUTE ON FUNCTION ytd_dia_corte()        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rmd_ytd_comparativo()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION nps_ytd_comparativo()  TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
