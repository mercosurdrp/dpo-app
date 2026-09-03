-- 142_pc_un_solo_volumen.sql
-- DPO 3.4 (R3.4.1): un solo criterio de volumen.
--
-- La migración 141 dejó el criterio en "CRÍTICO = el volumen del día supera la
-- capacidad de distribución", pero quedaron dos restos del modelo anterior:
--
--   1. Los planes de acción seguían indexados por combinación de triggers
--      ("PPPP", "PPP", "PP", "P", ""), una escala que ya no existe. Pasan a
--      tener un plan por escalón del calendario: CRITICO_ALTO (volumen +
--      contexto), CRITICO (sólo volumen), ATENCION (contexto sin volumen) y
--      NORMAL.
--   2. pc_config conservaba los pesos del "score continuo" (w_vol/w_otif/w_aus,
--      umbral_alto/umbral_medio, hl_p90_2025) y la vista calculaba `score` con
--      ellos. Era una segunda escala de volumen (BAJO/MEDIO/ALTO) que el
--      auditor pidió sacar. Se eliminan las columnas y la vista deja de
--      exponer `score`.
--
-- La app ya no lee ninguna de esas columnas, así que esta migración se puede
-- aplicar antes o después del deploy.

begin;

-- ── 1. Planes de acción por escalón ─────────────────────────────────────────
delete from pc_planes_accion where codigo in ('PPPP', 'PPP', 'PP', 'P', '');

insert into pc_planes_accion (codigo, descripcion, plan_texto) values
  ('CRITICO_ALTO',
   'Crítico + — el volumen supera la capacidad y además cruza clientes, rechazo o ausentismo',
   E'Día de máximo riesgo operativo: no alcanza la flota y además hay más clientes, más rechazo o más ausencias que lo normal.\n• Máxima dotación de choferes y ayudantes; cubrir TODAS las ausencias (no otorgar francos).\n• Acumular volumen los días previos (paletazos y clientes grandes adelantados) para bajar los HL del día.\n• Coordinar el ruteo con anticipación; habilitar refuerzo o segunda vuelta.\n• Reunión de coordinación previa con Ventas y seguimiento de la carga durante el día.\n• Comunicar a los clientes posibles demoras.'),
  ('CRITICO',
   'Crítico — el volumen supera la capacidad de distribución',
   E'Día que no entra en la flota con la ocupación normal.\n• Acumular volumen en los días previos: adelantar pedidos grandes y paletazos.\n• Revisar y priorizar el ruteo; reforzar con camión adicional o segunda vuelta si hace falta.\n• Cubrir ausencias del sector de entrega.\n• Seguimiento del avance de carga durante el día y aviso a Ventas.'),
  ('ATENCION',
   'Atención — no supera el volumen, pero cruza clientes, rechazo o ausentismo',
   E'Día que entra en la flota pero con una variable en alerta.\n• Reforzar el recurso del indicador en alerta (personal si es ausentismo; control de entregas si es rechazo; ruteo si son clientes).\n• Monitorear durante el día; sin acción extraordinaria.'),
  ('NORMAL',
   'Día normal',
   E'Operación normal.\n• Sin acción extraordinaria; tenerlo en cuenta al planificar la semana.')
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      plan_texto  = excluded.plan_texto,
      updated_at  = now();

-- ── 2. Sacar el score continuo de la vista y de pc_config ───────────────────
-- Las vistas dependen de las columnas que se van a borrar. `v_pc_calendario_dia`
-- es la proyección del año vigente sobre la multi-año, así que cae primero y se
-- vuelve a crear al final (sin CASCADE: queremos que falle si aparece otra
-- dependencia que no conocemos).
drop view if exists v_pc_calendario_dia;
drop view if exists v_pc_calendario_dia_multianio;

alter table pc_config
  drop column if exists w_vol,
  drop column if exists w_otif,
  drop column if exists w_aus,
  drop column if exists umbral_alto,
  drop column if exists umbral_medio,
  drop column if exists hl_p90_2025;

-- Misma vista que en 141, sin el CTE `scored` ni la columna `score`.
create or replace view v_pc_calendario_dia_multianio as
with cfg as (
  select u.vol_pico, u.clientes as umbral_clientes,
         u.otif_min, u.ausentismo_max
  from pc_umbrales u where u.id = 1
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
)
select anio, fecha, dow,
  case dow when 0 then 'Domingo'::text when 1 then 'Lunes'::text when 2 then 'Martes'::text when 3 then 'Miércoles'::text
           when 4 then 'Jueves'::text when 5 then 'Viernes'::text when 6 then 'Sábado'::text end as dia_semana,
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado, pct_ausentismo,
  clasif_vol, pct_capacidad,
  nombre_feriado is not null as es_feriado, nombre_feriado,
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
from final order by anio, fecha;

grant select on v_pc_calendario_dia_multianio to anon, authenticated, service_role;

-- ── Vista del año vigente (la consume /api/.../calendario) ──────────────────
create or replace view v_pc_calendario_dia as
select fecha, dow, dia_semana, mes, hl, hl_rechazo, camiones, clientes_dia,
       pct_rechazo, otif_estimado, pct_ausentismo, clasif_vol, pct_capacidad,
       es_feriado, nombre_feriado, tipo_feriado,
       trigger_vol, trigger_cli, trigger_otif, trigger_aus,
       trigger_count, contexto_count, codigo, estatus, nivel, anio
from v_pc_calendario_dia_multianio
where anio = (select anio_vigente from pc_config where id = 1);

grant select on v_pc_calendario_dia to anon, authenticated, service_role;

commit;
