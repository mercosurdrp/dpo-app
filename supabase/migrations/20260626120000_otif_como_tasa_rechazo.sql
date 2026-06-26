-- 20260626120000_otif_como_tasa_rechazo.sql
-- Cambio de definición de negocio (Pampeana): el "OTIF" que muestran las distintas
-- secciones pasa a ser DIRECTAMENTE la tasa de rechazo, sin el complemento.
--
--   Antes:  OTIF = 1 − (bultos_rechazados / bultos_distribuidos)   (mayor = mejor, ~99%)
--   Ahora:  OTIF =      bultos_rechazados / bultos_distribuidos     (menor = mejor, ~1-3%)
--
-- Se mantiene el denominador propio de cada sección (no se unifica):
--   * Períodos Críticos y NPS -> rechazos.bultos_entregados
--   * Árbol del Sueño         -> ventas_diarias.total_bultos
-- Se ajustan dirección (mejor_si), metas y gatillos para que los semáforos no
-- queden invertidos. Meta objetivo 1,7% (alineada con el KPI "Rechazo" existente).

begin;

-- =============================================================================
-- 1) PERÍODOS CRÍTICOS: la columna otif_estimado pasa a ser la tasa de rechazo
--    y el gatillo de día crítico pasa a "rechazo > umbral". El score interno no
--    cambia (siempre usó pct_rechazo). Se recalibra otif_min 0.97 -> 0.03.
-- =============================================================================
-- NOTA: se reproduce la definición vigente en prod (migs 110-113: join pc_ausentismo_diario,
-- columna tipo_feriado, nivel por trigger_count). SOLO cambian otif_estimado y trigger_otif.
create or replace view v_pc_calendario_dia_multianio as
with cfg as (
  select c.w_vol, c.w_otif, c.w_aus,
         c.umbral_alto as umbral_score_alto, c.umbral_medio as umbral_score_medio,
         coalesce(nullif(c.hl_p90_2025, 0::numeric), 1::numeric) as hl_p90,
         u.vol_pico, u.vol_alto, u.vol_medio, u.clientes as umbral_clientes,
         u.otif_min, u.ausentismo_max, u.min_triggers
  from pc_config c cross join pc_umbrales u where c.id = 1 and u.id = 1
),
anios as (select generate_series(2024, extract(year from current_date)::integer + 1) as anio),
fechas as (
  select a.anio, generate_series(make_date(a.anio,1,1)::timestamptz, make_date(a.anio,12,31)::timestamptz, '1 day'::interval)::date as fecha
  from anios a
),
ventas_dia as (
  select fecha, sum(total_hl) as hl_real, count(distinct ds_fletero_carga) as camiones
  from ventas_diarias group by fecha
),
rech_dia as (
  select fecha, sum(hl_rechazados) as hl_rech,
         sum(bultos_rechazados) as br, sum(bultos_entregados) as be
  from rechazos group by fecha
),
crudo as (
  select f.anio, f.fecha,
         extract(dow from f.fecha)::integer as dow, extract(month from f.fecha)::integer as mes,
         coalesce(h.bultos_distribuidos, v.hl_real, 0::numeric) as hl,
         coalesce(h.hl_rechazo, r.hl_rech, 0::numeric) as hl_rechazo,
         coalesce(nullif(h.camiones, 0)::bigint, v.camiones, 0::bigint)::integer as camiones,
         coalesce(h.clientes_distribuidos, 0) as clientes_dia,
         coalesce(h.otif_distribuido,
           case when r.be > 0 then 1.0 - r.br / r.be else null::numeric end) as otif_dist,
         coalesce(ad.pct_ausentismo, au.pct_ausentismo, 0::numeric) as pct_ausentismo,
         fer.nombre as nombre_feriado,
         fer.tipo as tipo_feriado
  from fechas f
  left join pc_volumen_diario h on h.fecha = f.fecha
  left join ventas_dia v on v.fecha = f.fecha
  left join rech_dia r on r.fecha = f.fecha
  left join pc_ausentismo_diario ad on ad.fecha = f.fecha
  left join pc_ausentismo_mensual au on au.anio = f.anio and au.mes = extract(month from f.fecha)::integer
  left join pc_feriados fer on fer.fecha = f.fecha
),
calc as (
  select c.anio, c.fecha, c.dow, c.mes, c.hl, c.hl_rechazo, c.camiones, c.clientes_dia,
         c.otif_dist, c.pct_ausentismo, c.nombre_feriado, c.tipo_feriado,
         1::numeric - coalesce(c.otif_dist, 1.0) as pct_rechazo,
         -- otif_estimado ahora ES la tasa de rechazo (1 - nivel de servicio).
         1::numeric - coalesce(c.otif_dist, 1.0) as otif_estimado,
         case when c.hl >= (select vol_pico from cfg) then 'PICO'::text
              when c.hl >= (select vol_alto from cfg) then 'ALTO'::text
              when c.hl >= (select vol_medio from cfg) then 'MEDIO'::text else 'BAJO'::text end as clasif_vol
  from crudo c
),
triggers as (
  select c.anio, c.fecha, c.dow, c.mes, c.hl, c.hl_rechazo, c.camiones, c.clientes_dia,
         c.otif_dist, c.pct_ausentismo, c.nombre_feriado, c.tipo_feriado,
         c.pct_rechazo, c.otif_estimado, c.clasif_vol,
         c.clasif_vol = 'PICO'::text as trigger_vol,
         c.clientes_dia > (select umbral_clientes from cfg) as trigger_cli,
         -- Día crítico por servicio cuando la tasa de rechazo supera otif_min (umbral máximo).
         c.otif_dist is not null and (1::numeric - c.otif_dist) > (select otif_min from cfg) as trigger_otif,
         c.pct_ausentismo >= (select ausentismo_max from cfg) as trigger_aus
  from calc c
),
final as (
  select t.anio, t.fecha, t.dow, t.mes, t.hl, t.hl_rechazo, t.camiones, t.clientes_dia,
         t.otif_dist, t.pct_ausentismo, t.nombre_feriado, t.tipo_feriado,
         t.pct_rechazo, t.otif_estimado, t.clasif_vol,
         t.trigger_vol, t.trigger_cli, t.trigger_otif, t.trigger_aus,
         (case when t.trigger_otif then 'P'::text else ''::text end || case when t.trigger_vol then 'P'::text else ''::text end ||
          case when t.trigger_cli then 'P'::text else ''::text end || case when t.trigger_aus then 'P'::text else ''::text end) as codigo,
         (case when t.trigger_otif then 1 else 0 end + case when t.trigger_vol then 1 else 0 end +
          case when t.trigger_cli then 1 else 0 end + case when t.trigger_aus then 1 else 0 end) as trigger_count
  from triggers t
),
scored as (
  select f.*,
         case when f.dow = 0 then 0::numeric
              else least(2.0, (select w_vol from cfg) * (f.hl / (select hl_p90 from cfg))
                 + (select w_otif from cfg) * f.pct_rechazo + (select w_aus from cfg) * f.pct_ausentismo) end as score
  from final f
)
select anio, fecha, dow,
  case dow when 0 then 'Domingo'::text when 1 then 'Lunes'::text when 2 then 'Martes'::text when 3 then 'Miércoles'::text
           when 4 then 'Jueves'::text when 5 then 'Viernes'::text when 6 then 'Sábado'::text end as dia_semana,
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado, pct_ausentismo, clasif_vol,
  nombre_feriado is not null as es_feriado, nombre_feriado, score,
  trigger_vol, trigger_cli, trigger_otif, trigger_aus, trigger_count, codigo,
  case when dow = 0 then 'NORMAL'::text when trigger_count >= (select min_triggers from cfg) then 'CRITICO'::text else 'NORMAL'::text end as estatus,
  case when dow = 0 then 'BAJO'::text
       when trigger_count < (select min_triggers from cfg) then 'BAJO'::text
       when trigger_count >= 3 then 'ALTO'::text else 'MEDIO'::text end as nivel,
  tipo_feriado
from scored order by anio, fecha;

-- Umbral pasa a leerse como "tasa de rechazo máxima": > 3% = día con problema de servicio.
update pc_umbrales set otif_min = 0.030, updated_at = now() where id = 1;

-- =============================================================================
-- 2) NPS: otif_interno mensual pasa a ser la tasa de rechazo (saca el 1 −).
-- =============================================================================
create or replace view v_nps_otif_mensual as
select
  extract(year from fecha)::int as anio,
  extract(month from fecha)::int as mes,
  sum(bultos_rechazados) as bultos_rechazados,
  sum(bultos_entregados) as bultos_entregados,
  case when sum(bultos_entregados) > 0
    then round(sum(bultos_rechazados)::numeric / sum(bultos_entregados) * 100, 2)
    else null end as otif_interno
from rechazos
group by 1, 2;

grant select on v_nps_otif_mensual to anon, authenticated, service_role;

-- =============================================================================
-- 3) ÁRBOL DEL SUEÑO: otif e in_full pasan a tasa de rechazo (= KPI rechazo).
-- =============================================================================
create or replace function sueno_kpi_refresh(p_anio int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rech numeric;
  v_ent  numeric;
  v_otif numeric;
  v_rpct numeric;
begin
  select coalesce(sum(bultos_rechazados), 0) into v_rech
  from rechazos where extract(year from coalesce(fecha_venta, fecha)) = p_anio;
  select coalesce(sum(total_bultos), 0) into v_ent
  from ventas_diarias where extract(year from fecha) = p_anio;

  if v_ent > 0 then
    v_rpct := round(v_rech / v_ent * 100, 2);
    v_otif := v_rpct;  -- OTIF = tasa de rechazo (mismo cálculo que rechazo)
    update sueno_kpi_valores set valor_ytd = v_otif, updated_at = now()
      where kpi_key = 'otif' and anio = p_anio;
    update sueno_kpi_valores set valor_ytd = v_rpct, updated_at = now()
      where kpi_key = 'rechazo' and anio = p_anio;
    update sueno_kpi_valores set valor_ytd = v_otif, updated_at = now()
      where kpi_key = 'in_full' and anio = p_anio;
  end if;

  update sueno_kpi_valores set valor_ytd = (
    select count(*) from reportes_seguridad
    where tipo = 'incidente' and extract(year from fecha) = p_anio
  ), updated_at = now() where kpi_key = 'n_incidentes' and anio = p_anio;

  update sueno_kpi_valores set valor_ytd = (
    select count(*) from reportes_seguridad
    where tipo = 'acto_inseguro' and extract(year from fecha) = p_anio
  ), updated_at = now() where kpi_key = 'comportamientos' and anio = p_anio;

  update sueno_kpi_valores set valor_ytd = (
    select count(*) from rechazos
    where ds_rechazo ilike '%sin dinero%'
      and extract(year from coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() where kpi_key = 'sin_dinero' and anio = p_anio;

  update sueno_kpi_valores set valor_ytd = (
    select count(*) from rechazos
    where ds_rechazo ilike '%cerrad%'
      and extract(year from coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() where kpi_key = 'cerrado' and anio = p_anio;
end;
$$;

grant execute on function sueno_kpi_refresh(int) to authenticated, service_role;

-- Detalle mensual: otif/in_full ahora devuelven la tasa de rechazo (igual que rechazo).
create or replace function sueno_kpi_detalle(p_kpi text, p_anio int)
returns table(mes int, valor numeric, detalle numeric)
language plpgsql
security definer
set search_path = public
as $$
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
    return query
    select extract(month from coalesce(fecha_venta, fecha))::int,
           count(*)::numeric, round(sum(bultos_rechazados), 0)
    from rechazos
    where ds_rechazo ilike '%sin dinero%' and extract(year from coalesce(fecha_venta, fecha)) = p_anio
    group by 1 order by 1;

  elsif p_kpi = 'cerrado' then
    return query
    select extract(month from coalesce(fecha_venta, fecha))::int,
           count(*)::numeric, round(sum(bultos_rechazados), 0)
    from rechazos
    where ds_rechazo ilike '%cerrad%' and extract(year from coalesce(fecha_venta, fecha)) = p_anio
    group by 1 order by 1;

  else
    return; -- manual: sin detalle automático
  end if;
end;
$$;

grant execute on function sueno_kpi_detalle(text, int) to authenticated, anon, service_role;

-- Dirección y meta de otif/in_full: ahora "menor es mejor", objetivo 1,7% (todos los años).
update sueno_kpi_valores set meta = 1.7, mejor_si = 'menor', updated_at = now()
  where kpi_key in ('otif', 'in_full');

commit;
