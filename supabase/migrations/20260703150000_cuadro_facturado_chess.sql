-- Fila "Facturados Chess" del cuadro mensual (pilar Ventas): total facturado
-- NETO en Chess (sistema madre, sin Gestión):
--   facturado = FCVTA (distribuido chess + mostrador) + PRVTA − DVVTA − PRDVO
-- Las tablas ventas_mostrador_diarias/_sku pasan a guardar también
-- ds_documento='DVVTA' (notas de crédito, TODAS — a diferencia de `rechazos`
-- que filtra idRechazo>0 + patente) y 'PRDVO' (devoluciones presupuesto),
-- ambos en valor ABSOLUTO; el consumidor los resta. Sin cambios de schema:
-- ds_documento ya discrimina (mig 20260702190000).

-- CEq mensual del distribuido SOLO Chess (origen='chess'), para la base de
-- "CEq facturadas Chess". Ya existía en la DB de Pampeana sin archivo de
-- migración (quedó de una iteración anterior); este archivo la fija al repo.
CREATE OR REPLACE FUNCTION cuadro_ceq_chess_mensual(p_desde date)
RETURNS TABLE(mes text, ceq numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
         sum(s.bultos * a.ceq_factor) AS ceq
  FROM ventas_diarias_sku s
  JOIN chess_articulos a ON a.id_articulo = s.id_articulo
  WHERE s.fecha >= p_desde AND s.origen = 'chess' AND a.ceq_factor IS NOT NULL
  GROUP BY 1;
$$;
