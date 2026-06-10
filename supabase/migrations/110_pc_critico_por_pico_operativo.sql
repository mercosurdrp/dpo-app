-- 110_pc_critico_por_pico_operativo.sql
-- Redefine qué es un DÍA CRÍTICO en el calendario de Períodos Críticos.
--
-- Problema: los 4 triggers no son homogéneos. Volumen y clientes son DIARIOS
-- (un pico puntual de carga), pero OTIF y ausentismo son MENSUALES (afectan
-- bloques de 30 días). Con el conteo `trigger_count >= min_triggers`, un mes con
-- OTIF bajo + ausentismo alto pintaba TODOS sus días como críticos (mayo, nov).
--
-- Solución: CRÍTICO = día de pico operativo (volumen PICO o clientes sobre la
-- capacidad de flota). OTIF y ausentismo dejan de crear criticidad por sí solos
-- y pasan a modular la SEVERIDAD (el `nivel` ALTO/MEDIO/BAJO ya sale del score
-- ponderado w_vol·vol + w_otif·rechazo + w_aus·ausentismo). Así un día pico en un
-- mes de mal servicio/alto ausentismo sale como ALTO, sin pintar el mes entero.
-- El `codigo` (PPPP) y los trigger_* se conservan como informativos.

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
  select fecha, sum(hl_rechazados) as hl_rech, sum(bultos_rechazados) as br, sum(bultos_entregados) as be
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
           case when r.be > 0 then 1.0 - r.br::numeric / r.be else null end) as otif_dist,
         coalesce(au.pct_ausentismo, 0::numeric) as pct_ausentismo,
         fer.nombre as nombre_feriado
  from fechas f
  left join pc_volumen_diario h on h.fecha = f.fecha
  left join ventas_dia v on v.fecha = f.fecha
  left join rech_dia r on r.fecha = f.fecha
  left join pc_ausentismo_mensual au on au.anio = f.anio and au.mes = extract(month from f.fecha)::integer
  left join pc_feriados fer on fer.fecha = f.fecha
),
calc as (
  select c.*, 1::numeric - coalesce(c.otif_dist, 1.0) as pct_rechazo,
         coalesce(c.otif_dist, 1.0) as otif_estimado,
         case when c.hl >= (select vol_pico from cfg) then 'PICO'
              when c.hl >= (select vol_alto from cfg) then 'ALTO'
              when c.hl >= (select vol_medio from cfg) then 'MEDIO' else 'BAJO' end as clasif_vol
  from crudo c
),
triggers as (
  select c.*, c.clasif_vol = 'PICO' as trigger_vol,
         c.clientes_dia > (select umbral_clientes from cfg) as trigger_cli,
         c.otif_dist is not null and c.otif_dist < (select otif_min from cfg) as trigger_otif,
         c.pct_ausentismo >= (select ausentismo_max from cfg) as trigger_aus
  from calc c
),
final as (
  select t.*,
         (case when t.trigger_otif then 'P' else '' end || case when t.trigger_vol then 'P' else '' end ||
          case when t.trigger_cli then 'P' else '' end || case when t.trigger_aus then 'P' else '' end) as codigo,
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
  case dow when 0 then 'Domingo' when 1 then 'Lunes' when 2 then 'Martes' when 3 then 'Miércoles'
           when 4 then 'Jueves' when 5 then 'Viernes' when 6 then 'Sábado' end as dia_semana,
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado, pct_ausentismo, clasif_vol,
  nombre_feriado is not null as es_feriado, nombre_feriado, score,
  trigger_vol, trigger_cli, trigger_otif, trigger_aus, trigger_count, codigo,
  case when dow = 0 then 'NORMAL'
       when trigger_vol or trigger_cli then 'CRITICO'
       else 'NORMAL' end as estatus,
  case when dow = 0 then 'BAJO'
       when score >= (select umbral_score_alto from cfg) then 'ALTO'
       when score >= (select umbral_score_medio from cfg) then 'MEDIO' else 'BAJO' end as nivel
from scored order by anio, fecha;
