-- Costo por PDV acumulado en un RANGO de meses (para la clusterización 4.2).
--
-- La clusterización lee todo sobre el semestre elegido (decisión del 28/09/2026):
-- facturación, crecimiento, drop size, rechazos, RMD y NPS. El costo logístico $/HL
-- de la matriz Valor × Costo era la única variable que seguía mirando el año
-- completo (get_costo_por_pdv_ytd_json = todos los meses cargados), así que la
-- corrida oficial de un semestre cerrado cambiaba cada vez que se cargaba un mes
-- nuevo de costo. Esta función acumula sólo los meses del rango pedido; la YTD
-- queda como wrapper (1..12) para el indicador Costo/PDV, que sigue siendo anual.

CREATE OR REPLACE FUNCTION public.get_costo_por_pdv_rango_json(
  p_anio integer,
  p_mes_desde integer,
  p_mes_hasta integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  with meses as (
    select mes from costo_logistico_mensual
    where anio = p_anio and mes between p_mes_desde and p_mes_hasta
  ),
  d as (
    select m.mes, f.*
    from meses m, lateral get_costo_por_pdv(p_anio, m.mes) f
  ),
  por_pdv as (
    select
      f.id_cliente,
      max(f.nombre_cliente) filter (where coalesce(f.nombre_cliente,'') <> '') as nombre_cliente,
      max(f.ciudad) filter (where f.ciudad is not null and f.ciudad <> '(sin ciudad)') as ciudad_ok,
      sum(f.bultos) bultos, sum(f.comprobantes) comprobantes, sum(f.hl) hl,
      sum(f.venta_neta) venta_neta, sum(f.costo_almacen) costo_almacen,
      sum(f.costo_distrib) costo_distrib, sum(f.costo_distancia) costo_distancia,
      sum(f.costo_total) costo_total,
      sum(f.bultos_rechazados) bultos_rechazados, sum(f.eventos_rechazo) eventos_rechazo
    from d f group by f.id_cliente
  ),
  resumen as (
    select mes, sum(costo_total) costo_total, sum(venta_neta) venta_neta,
           sum(bultos) bultos, sum(hl) hl, count(*)::int pdv
    from d group by mes
  )
  select jsonb_build_object(
    'data', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id_cliente', p.id_cliente,
        'nombre_cliente', coalesce(p.nombre_cliente,''),
        'ciudad', coalesce(p.ciudad_ok,'(sin ciudad)'),
        'bultos', round(p.bultos,1),
        'comprobantes', p.comprobantes,
        'hl', round(p.hl,1),
        'venta_neta', round(p.venta_neta,2),
        'costo_almacen', round(p.costo_almacen,2),
        'costo_distrib', round(p.costo_distrib,2),
        'costo_distancia', round(p.costo_distancia,2),
        'costo_total', round(p.costo_total,2),
        -- derivados recalculados sobre el TOTAL acumulado (no se promedian los meses)
        'costo_x_bulto', round(p.costo_total / nullif(p.bultos,0), 2),
        'costo_x_hl',    round(p.costo_total / nullif(p.hl,0), 2),
        'pct_venta',     round(100 * p.costo_total / nullif(p.venta_neta,0), 2),
        'bultos_rechazados', round(p.bultos_rechazados,1),
        'eventos_rechazo', p.eventos_rechazo,
        'pct_rechazo', round(100 * p.bultos_rechazados
                             / nullif(p.bultos + p.bultos_rechazados,0), 2)
      )) from por_pdv p
    ), '[]'::jsonb),
    'meses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'anio', p_anio, 'mes', r.mes,
        'costo_total', round(r.costo_total,2), 'venta_neta', round(r.venta_neta,2),
        'bultos', round(r.bultos,1), 'hl', round(r.hl,1), 'pdv', r.pdv
      ) order by r.mes) from resumen r
    ), '[]'::jsonb)
  );
$function$;

-- Mismo timeout propio que la YTD (ver migración 20260721140000).
ALTER FUNCTION public.get_costo_por_pdv_rango_json(integer, integer, integer) SET statement_timeout = '60s';

GRANT EXECUTE ON FUNCTION public.get_costo_por_pdv_rango_json(integer, integer, integer) TO anon, authenticated, service_role;

-- La YTD pasa a ser el rango 1..12, así hay una sola definición del acumulado.
CREATE OR REPLACE FUNCTION public.get_costo_por_pdv_ytd_json(p_anio integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  select public.get_costo_por_pdv_rango_json(p_anio, 1, 12);
$function$;

-- CREATE OR REPLACE pisa las opciones SET de la función: se vuelve a fijar el timeout.
ALTER FUNCTION public.get_costo_por_pdv_ytd_json(integer) SET statement_timeout = '60s';
