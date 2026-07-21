-- Acumulado YTD del Costo por PDV en UNA sola RPC.
--
-- Antes la app llamaba get_costo_por_pdv_json una vez por mes con Promise.all. Con 6
-- meses cargados salían 6 RPC simultáneas que se peleaban la CPU de la instancia y
-- varias morían por statement_timeout (authenticated = 8s). El código las descartaba
-- en silencio (`if ("error" in res) return`), así que el acumulado mostraba "5 meses
-- cargados" sin ningún error visible: faltaba un mes entero de costo y nadie se
-- enteraba. Se vio en los logs de Postgres como ráfagas de 6 timeouts con
-- milisegundos de diferencia.
--
-- Acá se agregan los meses en el servidor: un solo statement (~3s contra los 8s de
-- límite) y el payload baja de ~4 MB (6 × 1.670 filas) a ~1.977 filas ya acumuladas.

CREATE OR REPLACE FUNCTION public.get_costo_por_pdv_ytd_json(p_anio integer)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  with meses as (
    select mes from costo_logistico_mensual where anio = p_anio
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

GRANT EXECUTE ON FUNCTION public.get_costo_por_pdv_ytd_json(integer) TO anon, authenticated, service_role;
