-- Detalle mensual por KPI del Árbol del Sueño (para el modal "explica el número").
-- SECURITY DEFINER: agrega métricas sin exponer RLS de las tablas fuente.
CREATE OR REPLACE FUNCTION sueno_kpi_detalle(p_kpi text, p_anio int)
RETURNS TABLE(mes int, valor numeric, detalle numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kpi IN ('otif', 'rechazo', 'in_full') THEN
    RETURN QUERY
    WITH r AS (
      SELECT extract(month FROM coalesce(fecha_venta, fecha))::int AS m,
             sum(bultos_rechazados) AS br
      FROM rechazos
      WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
      GROUP BY 1
    ), v AS (
      SELECT extract(month FROM fecha)::int AS m, sum(total_bultos) AS be
      FROM ventas_diarias
      WHERE extract(year FROM fecha) = p_anio
      GROUP BY 1
    )
    SELECT v.m,
      CASE WHEN p_kpi = 'rechazo'
           THEN round(coalesce(r.br, 0) / nullif(v.be, 0) * 100, 2)
           ELSE round((1 - coalesce(r.br, 0) / nullif(v.be, 0)) * 100, 2)
      END,
      round(coalesce(r.br, 0), 0)
    FROM v LEFT JOIN r ON r.m = v.m
    ORDER BY v.m;

  ELSIF p_kpi = 'n_incidentes' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int, count(*)::numeric, NULL::numeric
    FROM reportes_seguridad
    WHERE tipo = 'incidente' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'comportamientos' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int, count(*)::numeric, NULL::numeric
    FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'sin_dinero' THEN
    RETURN QUERY
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int,
           count(*)::numeric, round(sum(bultos_rechazados), 0)
    FROM rechazos
    WHERE ds_rechazo ILIKE '%sin dinero%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'cerrado' THEN
    RETURN QUERY
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int,
           count(*)::numeric, round(sum(bultos_rechazados), 0)
    FROM rechazos
    WHERE ds_rechazo ILIKE '%cerrad%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSE
    RETURN; -- manual: sin detalle automático
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sueno_kpi_detalle(text, int) TO authenticated, anon, service_role;
