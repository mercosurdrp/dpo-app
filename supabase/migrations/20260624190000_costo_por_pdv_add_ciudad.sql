-- Agrega la columna `ciudad` al resultado de get_costo_por_pdv (cost-to-serve por PDV).
-- La ciudad sale de bot_clientes_cache (id_cliente→localidad) + dim_localidad_ciudad
-- (localidad→ciudad). Permite el corte por ciudad y el top de PDV por ciudad en la app.
-- Cambia el tipo de retorno → DROP + CREATE.

drop function if exists get_costo_por_pdv(int, int);

create function get_costo_por_pdv(p_anio int, p_mes int)
returns table (
  id_cliente int, nombre_cliente text, ciudad text, bultos numeric, comprobantes int, hl numeric,
  venta_neta numeric, costo_almacen numeric, costo_distrib numeric, costo_total numeric,
  costo_x_bulto numeric, costo_x_hl numeric, pct_venta numeric
)
language sql stable security invoker as $$
  with costo as (
    select distribucion, almacen, w_rodaje from costo_logistico_mensual where anio = p_anio and mes = p_mes
  ),
  base as (
    select v.id_cliente, max(v.nombre_cliente) as nombre_cliente,
           sum(v.bultos)::numeric as bultos, sum(v.comprobantes)::int as comprobantes,
           sum(v.hl)::numeric as hl, sum(v.monto_neto)::numeric as venta_neta
    from ventas_diarias_cliente v
    where v.fecha >= make_date(p_anio, p_mes, 1)
      and v.fecha <  (make_date(p_anio, p_mes, 1) + interval '1 month')
      and v.origen in ('chess','gestion')
    group by v.id_cliente
  ),
  geo as (
    select distinct on (b.id_cliente::text) b.id_cliente::text as id_cli,
           coalesce(nullif(d.ciudad,''),'(sin ciudad)') as ciudad
    from bot_clientes_cache b
    left join dim_localidad_ciudad d on upper(trim(d.localidad)) = upper(trim(b.localidad))
    order by b.id_cliente::text
  ),
  tot as (select sum(bultos) as b_tot, sum(comprobantes) as c_tot from base),
  calc as (
    select b.*,
      (select almacen from costo) * b.bultos / nullif((select b_tot from tot),0) as costo_almacen,
      (select distribucion from costo) * (
          (select w_rodaje from costo)       * b.bultos       / nullif((select b_tot from tot),0)
        + (1 - (select w_rodaje from costo)) * b.comprobantes / nullif((select c_tot from tot),0)
      ) as costo_distrib
    from base b
  )
  select c.id_cliente, c.nombre_cliente, coalesce(g.ciudad,'(sin ciudad)') as ciudad,
    round(c.bultos,1) as bultos, c.comprobantes, round(c.hl,1) as hl,
    round(c.venta_neta,2) as venta_neta,
    round(coalesce(c.costo_almacen,0),2) as costo_almacen,
    round(coalesce(c.costo_distrib,0),2) as costo_distrib,
    round(coalesce(c.costo_almacen,0)+coalesce(c.costo_distrib,0),2) as costo_total,
    round((coalesce(c.costo_almacen,0)+coalesce(c.costo_distrib,0)) / nullif(c.bultos,0),2) as costo_x_bulto,
    round((coalesce(c.costo_almacen,0)+coalesce(c.costo_distrib,0)) / nullif(c.hl,0),2) as costo_x_hl,
    round(100*(coalesce(c.costo_almacen,0)+coalesce(c.costo_distrib,0)) / nullif(c.venta_neta,0),2) as pct_venta
  from calc c
  left join geo g on g.id_cli = c.id_cliente::text
  order by costo_total desc;
$$;

grant execute on function get_costo_por_pdv(int, int) to authenticated;