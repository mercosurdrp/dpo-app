-- =============================================
-- Árbol del Sueño — detalle fino de rechazos (Sin Dinero / Cerrado)
-- RPCs para: % sobre el total de rechazos + ranking de clientes.
-- Reusan el MISMO filtro que sueno_kpi_detalle (135): ds_rechazo ILIKE
-- '%sin dinero%' / '%cerrad%' y coalesce(fecha_venta, fecha) → los números
-- cuadran con lo que ya muestra el árbol. Solo Pampeana.
-- =============================================

-- % del motivo sobre el total de rechazos, por mes (en veces y en bultos).
CREATE OR REPLACE FUNCTION sueno_rechazo_pct(p_kpi text, p_anio int)
RETURNS TABLE(
  mes int,
  cant_tipo numeric,
  cant_total numeric,
  bultos_tipo numeric,
  bultos_total numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    extract(month FROM coalesce(fecha_venta, fecha))::int AS mes,
    count(*) FILTER (
      WHERE ds_rechazo ILIKE (
        CASE WHEN p_kpi = 'sin_dinero' THEN '%sin dinero%'
             WHEN p_kpi = 'cerrado'    THEN '%cerrad%'
             ELSE NULL END)
    )::numeric AS cant_tipo,
    count(*)::numeric AS cant_total,
    coalesce(sum(bultos_rechazados) FILTER (
      WHERE ds_rechazo ILIKE (
        CASE WHEN p_kpi = 'sin_dinero' THEN '%sin dinero%'
             WHEN p_kpi = 'cerrado'    THEN '%cerrad%'
             ELSE NULL END)
    ), 0) AS bultos_tipo,
    coalesce(sum(bultos_rechazados), 0) AS bultos_total
  FROM rechazos
  WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
  GROUP BY 1
  ORDER BY 1;
$$;

-- Ranking de clientes para un motivo (sin_dinero / cerrado). p_mes NULL = año.
CREATE OR REPLACE FUNCTION sueno_rechazo_clientes(p_kpi text, p_anio int, p_mes int DEFAULT NULL)
RETURNS TABLE(
  id_cliente int,
  nombre_cliente text,
  eventos numeric,
  bultos numeric,
  hl numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(r.id_cliente, -1) AS id_cliente,
    coalesce(max(r.nombre_cliente), 'Sin cliente') AS nombre_cliente,
    count(*)::numeric AS eventos,
    coalesce(sum(r.bultos_rechazados), 0) AS bultos,
    coalesce(sum(r.hl_rechazados), 0) AS hl
  FROM rechazos r
  WHERE r.ds_rechazo ILIKE (
        CASE WHEN p_kpi = 'sin_dinero' THEN '%sin dinero%'
             WHEN p_kpi = 'cerrado'    THEN '%cerrad%'
             ELSE NULL END)
    AND extract(year FROM coalesce(r.fecha_venta, r.fecha)) = p_anio
    AND (p_mes IS NULL OR extract(month FROM coalesce(r.fecha_venta, r.fecha)) = p_mes)
  GROUP BY coalesce(r.id_cliente, -1)
  ORDER BY eventos DESC, bultos DESC;
$$;

GRANT EXECUTE ON FUNCTION sueno_rechazo_pct(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION sueno_rechazo_clientes(text, int, int) TO authenticated;
