-- Tiempo en ruta por CLIENTE, ciudad y patente.
--
-- Foxtrot NO mide la permanencia en el PDV (las columnas de paradas salen del GPS
-- y llegan vacías: `waiting_time_seconds` es 99,6% ceros). Pero los waypoints SÍ
-- traen la hora de completado, así que el ciclo por cliente se obtiene como el
-- delta entre paradas consecutivas de la misma ruta.
--
-- 🚨 El ciclo NO es tiempo de atención puro: incluye el manejo desde la parada
-- anterior. De ahí las tres decisiones de método:
--   1. se descarta la PRIMERA parada de cada ruta (arrastra el stem de salida);
--   2. se usa la MEDIANA, no el promedio (un solo outlier —almuerzo, tramo largo—
--      fabrica falsos positivos: un cliente promediaba 26,3 min con mediana 4,4);
--   3. cada cliente se compara contra la mediana de SU ciudad, nunca la global
--      (Arrecifes 3,9 min vs San Nicolás 7,2).
--
-- Validación: da 6,2 min de mediana global, y el TLP despeja 8,5 min/cliente por
-- una vía independiente (tiempo en ruta − manejo planificado − stems).

BEGIN;

-- Ciclo por parada, con cliente y ciudad ya resueltos.
CREATE OR REPLACE VIEW v_tiempo_ruta_ciclos AS
WITH w AS (
  SELECT
    route_id,
    fecha,
    customer_id,
    completed_timestamp,
    row_number() OVER (PARTITION BY route_id ORDER BY completed_timestamp) AS orden,
    lag(completed_timestamp) OVER (PARTITION BY route_id ORDER BY completed_timestamp) AS prev
  FROM foxtrot_waypoints_visita
  WHERE status = 'COMPLETED'
    AND completed_timestamp IS NOT NULL
)
SELECT
  w.route_id,
  w.fecha,
  w.customer_id,
  -- id_cliente = customer_id sin el prefijo de tenant '459025' (45902500014577 -> 14577)
  ltrim(substring(w.customer_id FROM 7), '0') AS id_cliente,
  b.nombre_cliente,
  b.localidad,
  COALESCE(dl.ciudad, 'Otras') AS ciudad,
  w.orden,
  EXTRACT(EPOCH FROM (w.completed_timestamp - w.prev)) / 60.0 AS ciclo_min
FROM w
LEFT JOIN bot_clientes_cache b
  ON b.id_cliente::text = ltrim(substring(w.customer_id FROM 7), '0')
LEFT JOIN dim_localidad_ciudad dl
  ON upper(trim(dl.localidad)) = upper(trim(b.localidad))
WHERE w.prev IS NOT NULL
  AND w.orden > 1                                                    -- (1)
  AND EXTRACT(EPOCH FROM (w.completed_timestamp - w.prev)) / 60.0 BETWEEN 0 AND 120;

COMMENT ON VIEW v_tiempo_ruta_ciclos IS
  'Ciclo por parada (min) = delta entre completed_timestamp consecutivos de la misma ruta. '
  'Incluye el manejo desde la parada anterior: NO es tiempo de atención puro. '
  'Excluye la 1a parada de cada ruta y los ciclos fuera de [0,120] min.';

-- Ranking de clientes por minutos recuperables contra la mediana de su ciudad.
CREATE OR REPLACE FUNCTION tiempo_ruta_clientes(
  p_desde DATE,
  p_hasta DATE,
  p_min_visitas INT DEFAULT 8
)
RETURNS TABLE (
  id_cliente TEXT,
  cliente TEXT,
  ciudad TEXT,
  visitas BIGINT,
  mediana_cliente NUMERIC,
  mediana_ciudad NUMERIC,
  exceso_min NUMERIC,
  min_recuperables NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT * FROM v_tiempo_ruta_ciclos
    WHERE fecha BETWEEN p_desde AND p_hasta
  ),
  med_ciudad AS (
    SELECT c.ciudad AS ciu,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY c.ciclo_min) AS med
    FROM base c GROUP BY c.ciudad
  ),
  por_cliente AS (
    SELECT c.id_cliente AS idc,
           max(c.nombre_cliente) AS nom,
           c.ciudad AS ciu,
           count(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY c.ciclo_min) AS med
    FROM base c
    GROUP BY c.id_cliente, c.ciudad
    HAVING count(*) >= p_min_visitas
  )
  SELECT
    p.idc,
    COALESCE(p.nom, '(sin nombre)'),
    p.ciu,
    p.n,
    round(p.med::numeric, 1),
    round(m.med::numeric, 1),
    round((p.med - m.med)::numeric, 1),
    round((p.n * (p.med - m.med))::numeric, 0)
  FROM por_cliente p
  JOIN med_ciudad m ON m.ciu = p.ciu
  ORDER BY (p.n * (p.med - m.med)) DESC;
$$;

COMMENT ON FUNCTION tiempo_ruta_clientes IS
  'Ranking de PDV por minutos recuperables = visitas x (mediana del cliente - mediana de su ciudad). '
  '🚨 La suma total NO es una meta alcanzable: por definición la mitad de los clientes está sobre '
  'la mediana. Lo accionable es la cola (top N).';

-- Resumen por ciudad: mediana del ciclo y potencial concentrado.
CREATE OR REPLACE FUNCTION tiempo_ruta_ciudades(
  p_desde DATE,
  p_hasta DATE,
  p_min_visitas INT DEFAULT 8
)
RETURNS TABLE (
  ciudad TEXT,
  paradas BIGINT,
  mediana_ciudad NUMERIC,
  clientes_sobre_mediana BIGINT,
  horas_recuperables NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT * FROM v_tiempo_ruta_ciclos
    WHERE fecha BETWEEN p_desde AND p_hasta
  ),
  cl AS (
    SELECT * FROM tiempo_ruta_clientes(p_desde, p_hasta, p_min_visitas)
    WHERE exceso_min > 0
  )
  SELECT
    b.ciudad,
    count(*),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.ciclo_min)::numeric, 1),
    COALESCE((SELECT count(*) FROM cl WHERE cl.ciudad = b.ciudad), 0),
    COALESCE((SELECT round((sum(cl.min_recuperables) / 60)::numeric, 1) FROM cl WHERE cl.ciudad = b.ciudad), 0)
  FROM base b
  GROUP BY b.ciudad
  ORDER BY count(*) DESC;
$$;

GRANT SELECT ON v_tiempo_ruta_ciclos TO authenticated;
GRANT EXECUTE ON FUNCTION tiempo_ruta_clientes(DATE, DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION tiempo_ruta_ciudades(DATE, DATE, INT) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
