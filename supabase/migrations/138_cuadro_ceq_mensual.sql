-- Función de agregación de CEq (cajas equivalentes) vendidas por mes, para la
-- fila "CEq vendidas" del cuadro mensual de indicadores (Pampeana).
-- CEq = bultos × ceq_factor (120 / bultos_pallet), derivada de ventas_diarias_sku
-- × chess_articulos → misma base que "Bultos vendidos" (cuadra). Se hace en SQL
-- porque suma ~20k filas/rango; traerlas al cliente sería innecesariamente pesado.

CREATE OR REPLACE FUNCTION cuadro_ceq_mensual(p_desde date)
RETURNS TABLE(mes text, ceq numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
         sum(s.bultos * a.ceq_factor) AS ceq
  FROM ventas_diarias_sku s
  JOIN chess_articulos a ON a.id_articulo = s.id_articulo
  WHERE s.fecha >= p_desde AND a.ceq_factor IS NOT NULL
  GROUP BY 1;
$$;
