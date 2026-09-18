-- HL vendidos por mes con el criterio de la fila "HL vendidos" (pilar Ventas)
-- del Cuadro Mensual (src/actions/cuadro-mensual.ts):
--   distribuido Chess (ventas_diarias, origen = 'chess')
--   + FCVTA mostrador + PRVTA (factura presupuesto)
--   − DVVTA (notas de crédito) − PRDVO (devoluciones presupuesto)
--   (ventas_mostrador_diarias, en valor absoluto)
-- Un mes sin distribuido Chess no sale, igual que en el cuadro.
--
-- La consume deposito-dashboard (/indicadores, #28 del Reporte DPO) con la
-- anon key: las dos tablas tienen RLS y no se quiere repartir la service key.
-- SECURITY DEFINER, como get_hl_despachado_diario / get_wnp_insumos_diario.
-- MANTENER EN SINCRONÍA con el cuadro si cambia el criterio.

CREATE OR REPLACE FUNCTION public.get_hl_vendidos_cuadro_mensual()
RETURNS TABLE (mes text, hl numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH chess AS (
    SELECT to_char(fecha, 'YYYY-MM') AS mes, SUM(total_hl) AS hl
    FROM public.ventas_diarias
    WHERE origen = 'chess'
    GROUP BY 1
  ),
  resto AS (
    SELECT to_char(fecha, 'YYYY-MM') AS mes,
           SUM(CASE WHEN ds_documento IN ('DVVTA', 'PRDVO') THEN -total_hl ELSE total_hl END) AS hl
    FROM public.ventas_mostrador_diarias
    GROUP BY 1
  )
  SELECT c.mes, ROUND((c.hl + COALESCE(r.hl, 0))::numeric, 2) AS hl
  FROM chess c
  LEFT JOIN resto r ON r.mes = c.mes
  WHERE c.hl > 0
  ORDER BY c.mes;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hl_vendidos_cuadro_mensual() TO anon, authenticated, service_role;
