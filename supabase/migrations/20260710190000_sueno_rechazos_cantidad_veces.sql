-- Árbol del Sueño: "Sin Dinero" y "Cerrado" pasan de contar FILAS de la tabla
-- rechazos (una por artículo rechazado → número inflado) a contar VECES:
-- ocurrencias distintas de cliente × fecha. Un cliente rechazado en 3 fechas
-- distintas cuenta 3; los N artículos de un mismo rechazo cuentan 1.
-- (2026 al 10/07: sin_dinero 2829 filas → 714 veces; cerrado 1524 → 361.)
-- Basado en 20260710150000_sueno_vlc_hl_auto.sql (definición viva de prod);
-- solo cambian las ramas sin_dinero / cerrado de ambas funciones.

create or replace function public.sueno_kpi_detalle(p_kpi text, p_anio integer)
 returns table(mes integer, valor numeric, detalle numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_kpi in ('otif', 'rechazo', 'in_full') then
    return query
    with r as (
      select extract(month from coalesce(fecha_venta, fecha))::int as m,
             sum(bultos_rechazados) as br
      from rechazos
      where extract(year from coalesce(fecha_venta, fecha)) = p_anio
      group by 1
    ), v as (
      select extract(month from fecha)::int as m, sum(total_bultos) as be
      from ventas_diarias
      where extract(year from fecha) = p_anio
      group by 1
    )
    select v.m,
      round(coalesce(r.br, 0) / nullif(v.be, 0) * 100, 2),
      round(coalesce(r.br, 0), 0)
    from v left join r on r.m = v.m
    order by v.m;

  elsif p_kpi = 'vlc_hl' then
    return query
    with hl as (
      select t.m, sum(t.hl) as hl
      from (
        select extract(month from fecha)::int as m, total_hl as hl
        from ventas_diarias
        where origen = 'chess' and extract(year from fecha) = p_anio
        union all
        select extract(month from fecha)::int,
               case when ds_documento in ('DVVTA', 'PRDVO') then -total_hl else total_hl end
        from ventas_mostrador_diarias
        where extract(year from fecha) = p_anio
      ) t
      group by t.m
    )
    select c.mes,
           round((c.distribucion + c.almacen) / nullif(h.hl, 0), 0),
           round(h.hl::numeric, 0)
    from costo_logistico_mensual c
    join hl h on h.m = c.mes
    where c.anio = p_anio
    order by c.mes;

  elsif p_kpi = 'n_incidentes' then
    return query
    select extract(month from fecha)::int, count(*)::numeric, null::numeric
    from reportes_seguridad
    where tipo = 'incidente' and extract(year from fecha) = p_anio
    group by 1 order by 1;

  elsif p_kpi = 'comportamientos' then
    return query
    select extract(month from fecha)::int, count(*)::numeric, null::numeric
    from reportes_seguridad
    where tipo = 'acto_inseguro' and extract(year from fecha) = p_anio
    group by 1 order by 1;

  elsif p_kpi = 'sin_dinero' then
    -- valor = VECES (cliente × fecha distintos), detalle = bultos
    return query
    select extract(month from coalesce(fecha_venta, fecha))::int,
           count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric,
           round(sum(bultos_rechazados), 0)
    from rechazos
    where ds_rechazo ilike '%sin dinero%' and extract(year from coalesce(fecha_venta, fecha)) = p_anio
    group by 1 order by 1;

  elsif p_kpi = 'cerrado' then
    -- valor = VECES (cliente × fecha distintos), detalle = bultos
    return query
    select extract(month from coalesce(fecha_venta, fecha))::int,
           count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric,
           round(sum(bultos_rechazados), 0)
    from rechazos
    where ds_rechazo ilike '%cerrad%' and extract(year from coalesce(fecha_venta, fecha)) = p_anio
    group by 1 order by 1;

  else
    return;
  end if;
end;
$function$;

create or replace function public.sueno_kpi_refresh(p_anio integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rech numeric;
  v_ent  numeric;
  v_otif numeric;
  v_rpct numeric;
  v_vlc  numeric;
begin
  select coalesce(sum(bultos_rechazados), 0) into v_rech
  from rechazos where extract(year from coalesce(fecha_venta, fecha)) = p_anio;
  select coalesce(sum(total_bultos), 0) into v_ent
  from ventas_diarias where extract(year from fecha) = p_anio;

  if v_ent > 0 then
    v_rpct := round(v_rech / v_ent * 100, 2);
    v_otif := v_rpct;
    update sueno_kpi_valores set valor_ytd = v_otif, updated_at = now()
      where kpi_key = 'otif' and anio = p_anio;
    update sueno_kpi_valores set valor_ytd = v_rpct, updated_at = now()
      where kpi_key = 'rechazo' and anio = p_anio;
    update sueno_kpi_valores set valor_ytd = v_otif, updated_at = now()
      where kpi_key = 'in_full' and anio = p_anio;
  end if;

  -- VLC/HL ponderado: Σ(distribución+almacén) ÷ Σ HL vendidos (Chess neto)
  -- de los meses con costo cargado. Sin costo cargado → no pisa el valor.
  select round(sum(c.distribucion + c.almacen) / nullif(sum(h.hl), 0), 0)
    into v_vlc
  from costo_logistico_mensual c
  join (
    select t.m, sum(t.hl) as hl
    from (
      select extract(month from fecha)::int as m, total_hl as hl
      from ventas_diarias
      where origen = 'chess' and extract(year from fecha) = p_anio
      union all
      select extract(month from fecha)::int,
             case when ds_documento in ('DVVTA', 'PRDVO') then -total_hl else total_hl end
      from ventas_mostrador_diarias
      where extract(year from fecha) = p_anio
    ) t
    group by t.m
  ) h on h.m = c.mes
  where c.anio = p_anio;

  if v_vlc is not null then
    update sueno_kpi_valores set valor_ytd = v_vlc, updated_at = now()
      where kpi_key = 'vlc_hl' and anio = p_anio;
  end if;

  update sueno_kpi_valores set valor_ytd = (
    select count(*) from reportes_seguridad
    where tipo = 'incidente' and extract(year from fecha) = p_anio
  ), updated_at = now() where kpi_key = 'n_incidentes' and anio = p_anio;

  update sueno_kpi_valores set valor_ytd = (
    select count(*) from reportes_seguridad
    where tipo = 'acto_inseguro' and extract(year from fecha) = p_anio
  ), updated_at = now() where kpi_key = 'comportamientos' and anio = p_anio;

  -- Veces = ocurrencias distintas de cliente × fecha (no filas por artículo).
  update sueno_kpi_valores set valor_ytd = (
    select count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))
    from rechazos
    where ds_rechazo ilike '%sin dinero%'
      and extract(year from coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() where kpi_key = 'sin_dinero' and anio = p_anio;

  update sueno_kpi_valores set valor_ytd = (
    select count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))
    from rechazos
    where ds_rechazo ilike '%cerrad%'
      and extract(year from coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() where kpi_key = 'cerrado' and anio = p_anio;
end;
$function$;
