-- Suma el volumen entregado al ranking de PDV.
--
-- Por qué: el ranking por minutos mezcla dos casos opuestos. Un supermercado que
-- baja 23 bultos en 16,6 min (0,74 min/bulto) está trabajando BIEN aunque figure
-- alto; y un PDV que tarda 42,8 min para dejar 6 bultos (7,44 min/bulto) no está
-- descargando: está esperando, o el acceso es malo, o se cobra en el momento.
-- Sin esta columna, la mitad de los planes de acción nacen mal dirigidos y el
-- primero que conozca la calle desarma el tablero.
--
-- Cobertura verificada: 705 de 705 clientes del ranking cruzan con
-- `ventas_diarias_cliente`.

BEGIN;

DROP FUNCTION IF EXISTS tiempo_ruta_ciudades(DATE, DATE, INT);
DROP FUNCTION IF EXISTS tiempo_ruta_clientes(DATE, DATE, INT);

CREATE FUNCTION tiempo_ruta_clientes(
  p_desde DATE, p_hasta DATE, p_min_visitas INT DEFAULT 8
)
RETURNS TABLE (
  id_cliente TEXT, cliente TEXT, ciudad TEXT, visitas BIGINT,
  mediana_cliente NUMERIC, mediana_ciudad NUMERIC, exceso_min NUMERIC,
  min_recuperables NUMERIC, bultos_med NUMERIC, min_por_bulto NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT * FROM v_tiempo_ruta_ciclos WHERE fecha BETWEEN p_desde AND p_hasta
  ),
  med_ciudad AS (
    SELECT c.ciudad AS ciu, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.ciclo_min) AS med
    FROM base c GROUP BY c.ciudad
  ),
  por_cliente AS (
    SELECT c.id_cliente AS idc, max(c.nombre_cliente) AS nom, c.ciudad AS ciu,
           count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.ciclo_min) AS med
    FROM base c GROUP BY c.id_cliente, c.ciudad HAVING count(*) >= p_min_visitas
  ),
  vol AS (
    SELECT v.id_cliente::text AS idc,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY v.bultos) AS bultos_med
    FROM ventas_diarias_cliente v
    WHERE v.fecha BETWEEN p_desde AND p_hasta AND v.bultos > 0
    GROUP BY v.id_cliente
  )
  SELECT p.idc, COALESCE(p.nom, '(sin nombre)'), p.ciu, p.n,
         round(p.med::numeric, 1), round(m.med::numeric, 1),
         round((p.med - m.med)::numeric, 1), round((p.n * (p.med - m.med))::numeric, 0),
         round(vol.bultos_med::numeric, 0),
         round((p.med / NULLIF(vol.bultos_med, 0))::numeric, 2)
  FROM por_cliente p
  JOIN med_ciudad m ON m.ciu = p.ciu
  LEFT JOIN vol ON vol.idc = p.idc
  ORDER BY (p.n * (p.med - m.med)) DESC;
$$;

COMMENT ON FUNCTION tiempo_ruta_clientes IS
  'Ranking de PDV por minutos recuperables = visitas x (mediana del cliente - mediana de su ciudad). min_por_bulto separa al que tarda por volumen (normal) del que tarda por espera/acceso/cobranza (accionable). La suma total NO es meta: por definicion la mitad esta sobre la mediana.';

CREATE FUNCTION tiempo_ruta_ciudades(
  p_desde DATE, p_hasta DATE, p_min_visitas INT DEFAULT 8
)
RETURNS TABLE (
  ciudad TEXT, paradas BIGINT, mediana_ciudad NUMERIC,
  clientes_sobre_mediana BIGINT, horas_recuperables NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT * FROM v_tiempo_ruta_ciclos WHERE fecha BETWEEN p_desde AND p_hasta
  ),
  cl AS (
    SELECT * FROM tiempo_ruta_clientes(p_desde, p_hasta, p_min_visitas) WHERE exceso_min > 0
  )
  SELECT b.ciudad, count(*),
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY b.ciclo_min)::numeric, 1),
    COALESCE((SELECT count(*) FROM cl WHERE cl.ciudad = b.ciudad), 0),
    COALESCE((SELECT round((sum(cl.min_recuperables) / 60)::numeric, 1) FROM cl WHERE cl.ciudad = b.ciudad), 0)
  FROM base b GROUP BY b.ciudad ORDER BY count(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION tiempo_ruta_clientes(DATE, DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION tiempo_ruta_ciudades(DATE, DATE, INT) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
