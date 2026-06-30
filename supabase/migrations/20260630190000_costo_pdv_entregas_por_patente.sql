-- Costo por PDV — ENTREGAS por PATENTE (camión físico), reemplaza el criterio
-- por ds_fletero_carga de la migración 20260630180000.
-- Motivo: en Chess ds_fletero_carga = patente, pero en Gestión es un código de
-- fletero (GESTION-xxxx) distinto, así que Chess+Gestión del MISMO camión/día NO
-- colapsaban y se contaban doble (caso Suárez Roxana id 13304: 4 en vez de 2).
-- La columna `patente` sí es el mismo camión en ambos orígenes → contar
-- distinct (fecha, patente) por cliente da las idas reales. Fallback a
-- ds_fletero_carga si la patente viene vacía.
-- Afecta la columna "Entregas" y el reparto de costo_distancia; ese costo_x_hl
-- lo consume también la clusterización (getCostoPorPdvYtd, on-demand → recalcula
-- automáticamente). bultos/hl/venta siguen Chess+Gestión.

CREATE OR REPLACE FUNCTION public.get_costo_por_pdv(p_anio integer, p_mes integer)
 RETURNS TABLE(id_cliente integer, nombre_cliente text, ciudad text, bultos numeric, comprobantes integer, hl numeric, venta_neta numeric, costo_almacen numeric, costo_distrib numeric, costo_distancia numeric, costo_total numeric, costo_x_bulto numeric, costo_x_hl numeric, pct_venta numeric, bultos_rechazados numeric, eventos_rechazo integer, pct_rechazo numeric)
 LANGUAGE sql
 STABLE
AS $$
  with costo as (
    select distribucion, almacen, km_totales from costo_logistico_mensual where anio=p_anio and mes=p_mes
  ),
  kmtot as (
    select nullif(coalesce(
      (select km_totales from costo),
      (select sum(km_recorridos) from registro_combustible
        where fecha >= make_date(p_anio,p_mes,1) and fecha < (make_date(p_anio,p_mes,1)+interval '1 month'))
    ),0)::numeric kmt
  ),
  base as (
    select vd.id_cliente, max(vd.nombre_cliente) nombre_cliente,
           sum(vd.bultos)::numeric bultos,
           count(distinct vd.fecha::text || '|' || coalesce(nullif(trim(vd.patente),''), vd.ds_fletero_carga, ''))::int comprobantes,
           sum(vd.hl)::numeric hl, sum(vd.monto_neto)::numeric venta_neta
    from ventas_diarias_cliente vd
    where vd.fecha >= make_date(p_anio,p_mes,1) and vd.fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
      and vd.origen in ('chess','gestion')
    group by vd.id_cliente
  ),
  geo as (
    select distinct on (id_cli) id_cli, ciudad from (
      select b.id_cliente::text id_cli, d.ciudad, 1 prio
        from bot_clientes_cache b join dim_localidad_ciudad d on upper(trim(d.localidad))=upper(trim(b.localidad))
      union all select o.id_cliente::text, o.ciudad, 2 from cliente_ciudad_override o
    ) u order by id_cli, prio
  ),
  base_geo as (
    select b.*, coalesce(g.ciudad,'San Nicolás') ciudad, coalesce(k.km,0) km
    from base b
    left join geo g on g.id_cli=b.id_cliente::text
    left join costo_km_ciudad k on k.ciudad = coalesce(g.ciudad,'San Nicolás')
  ),
  lineas as (
    select vd.fecha, nullif(trim(vd.patente),'') patente, coalesce(g.ciudad,'San Nicolás') ciudad,
           count(*) clientes, sum(vd.bultos) bultos
    from ventas_diarias_cliente vd left join geo g on g.id_cli=vd.id_cliente::text
    where vd.fecha >= make_date(p_anio,p_mes,1) and vd.fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
      and vd.origen in ('chess','gestion')
    group by 1,2,3
  ),
  principal as (
    select distinct on (fecha,patente) fecha, patente, ciudad
    from lineas order by fecha, patente, clientes desc, bultos desc
  ),
  viajes as (select ciudad, count(*) v from principal group by ciudad),
  lh as (
    select bgc.ciudad,
           coalesce(k.km,0)*2*coalesce(vi.v,0) * ((select distribucion from costo) / (select kmt from kmtot)) costo_llegar
    from (select distinct ciudad from base_geo) bgc
    left join costo_km_ciudad k on k.ciudad=bgc.ciudad
    left join viajes vi on vi.ciudad=bgc.ciudad
  ),
  ent as (select ciudad, sum(comprobantes) ent_c from base_geo group by ciudad),
  sl as (select coalesce(sum(costo_llegar),0) tot_llegar from lh),
  tot as (select sum(bultos) b_tot from base_geo),
  rech as (
    select id_cliente, sum(bultos_rechazados)::numeric bultos_rech, count(*)::int eventos_rech
    from rechazos
    where fecha >= make_date(p_anio,p_mes,1) and fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
    group by id_cliente
  ),
  calc as (
    select bg.*,
      (select almacen from costo) * bg.bultos / nullif((select b_tot from tot),0) as costo_almacen,
      coalesce(lh.costo_llegar,0) * bg.comprobantes / nullif(ent.ent_c,0) as costo_distancia,
      ((select distribucion from costo) - (select tot_llegar from sl)) * bg.bultos / nullif((select b_tot from tot),0) as costo_distrib
    from base_geo bg
    left join lh on lh.ciudad=bg.ciudad
    left join ent on ent.ciudad=bg.ciudad
  )
  select c.id_cliente, c.nombre_cliente, c.ciudad,
    round(c.bultos,1) as bultos, c.comprobantes, round(c.hl,1) as hl,
    round(c.venta_neta,2) as venta_neta,
    round(coalesce(c.costo_almacen,0),2) as costo_almacen,
    round(coalesce(c.costo_distrib,0),2) as costo_distrib,
    round(coalesce(c.costo_distancia,0),2) as costo_distancia,
    round(coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0),2) as costo_total,
    round((coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0)) / nullif(c.bultos,0),2) as costo_x_bulto,
    round((coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0)) / nullif(c.hl,0),2) as costo_x_hl,
    round(100*(coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0)) / nullif(c.venta_neta,0),2) as pct_venta,
    round(coalesce(r.bultos_rech,0),1) as bultos_rechazados,
    coalesce(r.eventos_rech,0) as eventos_rechazo,
    round(100*coalesce(r.bultos_rech,0) / nullif(c.bultos + coalesce(r.bultos_rech,0),0),2) as pct_rechazo
  from calc c
  left join rech r on r.id_cliente = c.id_cliente
  order by costo_total desc;
$$;

CREATE OR REPLACE FUNCTION public.get_costo_por_pdv_sim(p_anio integer, p_mes integer, p_km jsonb)
 RETURNS TABLE(id_cliente integer, nombre_cliente text, ciudad text, bultos numeric, comprobantes integer, hl numeric, venta_neta numeric, costo_almacen numeric, costo_distrib numeric, costo_distancia numeric, costo_total numeric, costo_x_bulto numeric, costo_x_hl numeric, pct_venta numeric, bultos_rechazados numeric, eventos_rechazo integer, pct_rechazo numeric)
 LANGUAGE sql
 STABLE
AS $$
  with costo as (
    select distribucion, almacen from costo_logistico_mensual where anio=p_anio and mes=p_mes
  ),
  kmtot as (
    select nullif(sum(km_recorridos),0)::numeric kmt
    from registro_combustible
    where fecha >= make_date(p_anio,p_mes,1) and fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
  ),
  base as (
    select vd.id_cliente, max(vd.nombre_cliente) nombre_cliente,
           sum(vd.bultos)::numeric bultos,
           count(distinct vd.fecha::text || '|' || coalesce(nullif(trim(vd.patente),''), vd.ds_fletero_carga, ''))::int comprobantes,
           sum(vd.hl)::numeric hl, sum(vd.monto_neto)::numeric venta_neta
    from ventas_diarias_cliente vd
    where vd.fecha >= make_date(p_anio,p_mes,1) and vd.fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
      and vd.origen in ('chess','gestion')
    group by vd.id_cliente
  ),
  geo as (
    select distinct on (id_cli) id_cli, ciudad from (
      select b.id_cliente::text id_cli, d.ciudad, 1 prio
        from bot_clientes_cache b join dim_localidad_ciudad d on upper(trim(d.localidad))=upper(trim(b.localidad))
      union all select o.id_cliente::text, o.ciudad, 2 from cliente_ciudad_override o
    ) u order by id_cli, prio
  ),
  base_geo as (
    select b.*, coalesce(g.ciudad,'San Nicolás') ciudad,
           coalesce((p_km ->> coalesce(g.ciudad,'San Nicolás'))::numeric,0) km
    from base b
    left join geo g on g.id_cli=b.id_cliente::text
  ),
  lineas as (
    select vd.fecha, nullif(trim(vd.patente),'') patente, coalesce(g.ciudad,'San Nicolás') ciudad,
           count(*) clientes, sum(vd.bultos) bultos
    from ventas_diarias_cliente vd left join geo g on g.id_cli=vd.id_cliente::text
    where vd.fecha >= make_date(p_anio,p_mes,1) and vd.fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
      and vd.origen in ('chess','gestion')
    group by 1,2,3
  ),
  principal as (
    select distinct on (fecha,patente) fecha, patente, ciudad
    from lineas order by fecha, patente, clientes desc, bultos desc
  ),
  viajes as (select ciudad, count(*) v from principal group by ciudad),
  lh as (
    select bgc.ciudad,
           coalesce((p_km ->> bgc.ciudad)::numeric,0)*2*coalesce(vi.v,0) * ((select distribucion from costo) / (select kmt from kmtot)) costo_llegar
    from (select distinct ciudad from base_geo) bgc
    left join viajes vi on vi.ciudad=bgc.ciudad
  ),
  ent as (select ciudad, sum(comprobantes) ent_c from base_geo group by ciudad),
  sl as (select coalesce(sum(costo_llegar),0) tot_llegar from lh),
  tot as (select sum(bultos) b_tot from base_geo),
  rech as (
    select id_cliente, sum(bultos_rechazados)::numeric bultos_rech, count(*)::int eventos_rech
    from rechazos
    where fecha >= make_date(p_anio,p_mes,1) and fecha < (make_date(p_anio,p_mes,1)+interval '1 month')
    group by id_cliente
  ),
  calc as (
    select bg.*,
      (select almacen from costo) * bg.bultos / nullif((select b_tot from tot),0) as costo_almacen,
      coalesce(lh.costo_llegar,0) * bg.comprobantes / nullif(ent.ent_c,0) as costo_distancia,
      ((select distribucion from costo) - (select tot_llegar from sl)) * bg.bultos / nullif((select b_tot from tot),0) as costo_distrib
    from base_geo bg
    left join lh on lh.ciudad=bg.ciudad
    left join ent on ent.ciudad=bg.ciudad
  )
  select c.id_cliente, c.nombre_cliente, c.ciudad,
    round(c.bultos,1) as bultos, c.comprobantes, round(c.hl,1) as hl,
    round(c.venta_neta,2) as venta_neta,
    round(coalesce(c.costo_almacen,0),2) as costo_almacen,
    round(coalesce(c.costo_distrib,0),2) as costo_distrib,
    round(coalesce(c.costo_distancia,0),2) as costo_distancia,
    round(coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0),2) as costo_total,
    round((coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0)) / nullif(c.bultos,0),2) as costo_x_bulto,
    round((coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0)) / nullif(c.hl,0),2) as costo_x_hl,
    round(100*(coalesce(c.costo_almacen,0)+coalesce(c.costo_distancia,0)+coalesce(c.costo_distrib,0)) / nullif(c.venta_neta,0),2) as pct_venta,
    round(coalesce(r.bultos_rech,0),1) as bultos_rechazados,
    coalesce(r.eventos_rech,0) as eventos_rechazo,
    round(100*coalesce(r.bultos_rech,0) / nullif(c.bultos + coalesce(r.bultos_rech,0),0),2) as pct_rechazo
  from calc c
  left join rech r on r.id_cliente = c.id_cliente
  order by costo_total desc;
$$;
