-- 141_pc_critico_solo_volumen.sql
-- Simplificación de DPO 3.4 pedida por el auditor (agosto 2026).
--
-- ANTES: un día era CRITICO cuando cruzaban `min_triggers` (=3) de las 4
-- variables, en cualquier combinación. Un día con rechazo alto + ausentismo alto
-- + muchos clientes salía crítico aunque el volumen fuera normal. Además el
-- volumen se clasificaba en tres escalones (PICO/ALTO/MEDIO) que no decidían
-- nada: sólo el escalón PICO gatillaba.
--
-- AHORA: manda el volumen. CRITICO = el día supera la capacidad de distribución.
-- Clientes, rechazo y ausentismo se siguen cruzando —R3.4.1 los exige en el
-- calendario— pero sólo agravan la severidad (nivel ALTO vs MEDIO): nunca
-- vuelven crítico a un día que no superó el volumen.
--
-- El umbral de volumen deja de ser un número suelto y se deriva de la flota:
--   camiones × HL por camión × % ocupación de bodega = 10 × 72 × 0,90 = 648 HL
-- Se guarda como columna GENERADA para que haya una sola fuente de verdad: se
-- edita la flota, no el umbral.
--
-- Se eliminan vol_alto, vol_medio y min_triggers.

begin;

-- Las vistas dependen de las columnas que se van a borrar. `v_pc_calendario_dia`
-- es la proyección del año vigente sobre la multi-año, así que cae primero y se
-- vuelve a crear al final (sin CASCADE: queremos que falle si aparece otra
-- dependencia que no conocemos).
drop view if exists v_pc_calendario_dia;
drop view if exists v_pc_calendario_dia_multianio;

-- ── Umbrales: la capacidad reemplaza a la escalera de volumen ────────────────
alter table pc_umbrales drop constraint if exists pc_umbrales_check;

alter table pc_umbrales
  add column if not exists camiones      integer not null default 10,
  add column if not exists hl_por_camion numeric not null default 72,
  add column if not exists pct_ocupacion numeric not null default 0.90;

alter table pc_umbrales
  drop constraint if exists pc_umbrales_camiones_check,
  drop constraint if exists pc_umbrales_hl_por_camion_check,
  drop constraint if exists pc_umbrales_pct_ocupacion_check;

alter table pc_umbrales
  add constraint pc_umbrales_camiones_check      check (camiones > 0 and camiones <= 200),
  add constraint pc_umbrales_hl_por_camion_check check (hl_por_camion > 0 and hl_por_camion <= 1000),
  -- Admite > 1: subir la ocupación por encima del 100% es la forma de exigir
  -- más volumen para que un día cuente como crítico.
  add constraint pc_umbrales_pct_ocupacion_check check (pct_ocupacion > 0 and pct_ocupacion <= 3);

alter table pc_umbrales
  drop column if exists vol_pico,
  drop column if exists vol_alto,
  drop column if exists vol_medio,
  drop column if exists min_triggers;

alter table pc_umbrales
  add column vol_pico numeric
  generated always as (round(camiones::numeric * hl_por_camion * pct_ocupacion, 0)) stored;

comment on column pc_umbrales.vol_pico is
  'Capacidad de distribución en HL. Derivada: camiones × hl_por_camion × pct_ocupacion. No se edita directo.';

-- ── Calendario ──────────────────────────────────────────────────────────────
create or replace view v_pc_calendario_dia_multianio as
with cfg as (
  select c.w_vol, c.w_otif, c.w_aus,
         c.umbral_alto as umbral_score_alto, c.umbral_medio as umbral_score_medio,
         coalesce(nullif(c.hl_p90_2025, 0::numeric), 1::numeric) as hl_p90,
         u.vol_pico, u.clientes as umbral_clientes,
         u.otif_min, u.ausentismo_max
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
         -- otif_estimado ES la tasa de rechazo (ver 20260626120000).
         1::numeric - coalesce(c.otif_dist, 1.0) as otif_estimado,
         -- Un solo escalón: se supera la capacidad o no se supera.
         case when c.hl >= (select vol_pico from cfg) then 'PICO'::text
              else 'NORMAL'::text end as clasif_vol,
         case when (select vol_pico from cfg) > 0
              then round(c.hl / (select vol_pico from cfg), 4)
              else 0::numeric end as pct_capacidad
  from crudo c
),
triggers as (
  select c.*,
         c.clasif_vol = 'PICO'::text as trigger_vol,
         c.clientes_dia > (select umbral_clientes from cfg) as trigger_cli,
         c.otif_dist is not null and (1::numeric - c.otif_dist) > (select otif_min from cfg) as trigger_otif,
         c.pct_ausentismo >= (select ausentismo_max from cfg) as trigger_aus
  from calc c
),
final as (
  select t.*,
         (case when t.trigger_otif then 'P'::text else ''::text end || case when t.trigger_vol then 'P'::text else ''::text end ||
          case when t.trigger_cli then 'P'::text else ''::text end || case when t.trigger_aus then 'P'::text else ''::text end) as codigo,
         (case when t.trigger_otif then 1 else 0 end + case when t.trigger_vol then 1 else 0 end +
          case when t.trigger_cli then 1 else 0 end + case when t.trigger_aus then 1 else 0 end) as trigger_count,
         -- Cuántas de las OTRAS tres acompañan al volumen (define la severidad).
         (case when t.trigger_otif then 1 else 0 end +
          case when t.trigger_cli then 1 else 0 end + case when t.trigger_aus then 1 else 0 end) as contexto_count
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
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado, pct_ausentismo,
  clasif_vol, pct_capacidad,
  nombre_feriado is not null as es_feriado, nombre_feriado, score,
  trigger_vol, trigger_cli, trigger_otif, trigger_aus, trigger_count, contexto_count, codigo,
  -- CRÍTICO sólo si supera el volumen. Las otras tres no alcanzan.
  case when dow = 0 then 'NORMAL'::text
       when trigger_vol then 'CRITICO'::text
       else 'NORMAL'::text end as estatus,
  -- Severidad del día crítico: ALTO si además cruza alguna de las otras tres.
  case when dow = 0 then 'BAJO'::text
       when not trigger_vol then 'BAJO'::text
       when contexto_count > 0 then 'ALTO'::text
       else 'MEDIO'::text end as nivel,
  tipo_feriado
from scored order by anio, fecha;

grant select on v_pc_calendario_dia_multianio to anon, authenticated, service_role;

-- ── Vista del año vigente (la consume /api/.../calendario) ──────────────────
-- Mismas columnas que antes + las tres nuevas: pct_capacidad, contexto_count y
-- tipo_feriado (esta última ya existía en la multi-año pero nunca se proyectó).
create or replace view v_pc_calendario_dia as
select fecha, dow, dia_semana, mes, hl, hl_rechazo, camiones, clientes_dia,
       pct_rechazo, otif_estimado, pct_ausentismo, clasif_vol, pct_capacidad,
       es_feriado, nombre_feriado, tipo_feriado, score,
       trigger_vol, trigger_cli, trigger_otif, trigger_aus,
       trigger_count, contexto_count, codigo, estatus, nivel, anio
from v_pc_calendario_dia_multianio
where anio = (select anio_vigente from pc_config where id = 1);

grant select on v_pc_calendario_dia to anon, authenticated, service_role;

commit;
