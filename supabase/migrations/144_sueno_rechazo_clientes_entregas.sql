-- =============================================
-- Ranking de clientes del Árbol del Sueño: "Veces" pasa a contar
-- ENTREGAS RECHAZADAS (comprobantes distintos = serie+nº documento),
-- en vez de líneas de rechazo (cada SKU). Más intuitivo para "cuántas
-- veces el cliente rechazó una entrega". Solo Pampeana.
-- DROP + CREATE porque cambia el nombre de la columna de salida.
-- =============================================

DROP FUNCTION IF EXISTS sueno_rechazo_clientes(text, int, int);

CREATE FUNCTION sueno_rechazo_clientes(p_kpi text, p_anio int, p_mes int DEFAULT NULL)
RETURNS TABLE(
  id_cliente int,
  nombre_cliente text,
  entregas numeric,
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
    count(DISTINCT (r.serie, r.nrodoc))::numeric AS entregas,
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
  ORDER BY entregas DESC, bultos DESC;
$$;

GRANT EXECUTE ON FUNCTION sueno_rechazo_clientes(text, int, int) TO authenticated;
