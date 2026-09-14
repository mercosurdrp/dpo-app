-- 159_pc_tres_indicadores.sql
-- DPO 3.4: vuelve el "juego de las P". Pedido por Sebastián Roselli, 14/09/2026.
--
-- ANTES (141→144): un día era CRÍTICO sólo por volumen; clientes, rechazo y
-- ausentismo eran contexto y el amarillo era "al límite" (90–100% de la
-- capacidad).
--
-- AHORA: tres indicadores, cada uno da una P cuando cruza su umbral:
--   · Volumen    — los HL del día llegan a la capacidad de distribución
--   · Rechazo    — la tasa de rechazo del día supera el máximo
--   · Ausentismo — el % de ausentes del día llega al máximo
-- y el color sale de cuántas P juntó el día:
--   ROJO     CRITICO  = PPP  (los tres cruzados)
--   AMARILLO ATENCION = PP   (dos de tres)
--   VERDE    NORMAL   = P o ninguna
--
-- Clientes deja de ser indicador: `clientes_dia` sigue en la vista como dato
-- del tooltip, pero ya no hay umbral ni trigger. La banda "al límite" se va
-- (el % de capacidad se sigue mostrando, no decide color).
--
-- Umbrales fijados por Sebastián el 14/09/2026: capacidad 10 × 72 × 90% = 648 HL
-- y rechazo > 2%. El de ausentismo queda como estaba (10% = 3 de 30) y se
-- ajusta desde la pantalla. Ojo: el ausentismo diario viene en escalones de
-- 3,33% (1 persona de 30), así que 10% exige 3 ausentes el mismo día.

begin;

-- Las vistas dependen de la columna que se va a borrar. `v_pc_calendario_dia`
-- es la proyección del año vigente sobre la multi-año: cae primero y se vuelve
-- a crear al final (sin CASCADE, para que falle si aparece otra dependencia).
drop view if exists v_pc_calendario_dia;
drop view if exists v_pc_calendario_dia_multianio;

-- ── Umbrales: sin clientes; capacidad y rechazo según lo pedido ─────────────
alter table pc_umbrales drop column if exists clientes;

update pc_umbrales
   set pct_ocupacion = 0.90,
       otif_min      = 0.02,
       updated_at    = now()
 where id = 1;

comment on column pc_umbrales.otif_min is
  'Tasa de rechazo máxima del día (0–1). Por encima, el día suma la P de rechazo.';
comment on column pc_umbrales.ausentismo_max is
  '% de ausentes máximo del día (0–1). Desde ese valor, el día suma la P de ausentismo. El diario viene en escalones de 1/total_planta.';

-- ── Calendario ──────────────────────────────────────────────────────────────
create or replace view v_pc_calendario_dia_multianio as
with cfg as (
  select u.vol_pico, u.otif_min, u.ausentismo_max
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
         case when (select vol_pico from cfg) > 0
              then round(c.hl / (select vol_pico from cfg), 4)
              else 0::numeric end as pct_capacidad
  from crudo c
),
-- Una P por indicador. El domingo no se reparte: no suma ninguna.
triggers as (
  select c.*,
         c.dow <> 0 and c.hl >= (select vol_pico from cfg) as trigger_vol,
         c.dow <> 0 and c.otif_dist is not null
           and (1::numeric - c.otif_dist) > (select otif_min from cfg) as trigger_otif,
         c.dow <> 0 and c.pct_ausentismo >= (select ausentismo_max from cfg) as trigger_aus
  from calc c
),
final as (
  select t.*,
         (case when t.trigger_vol then 1 else 0 end +
          case when t.trigger_otif then 1 else 0 end +
          case when t.trigger_aus then 1 else 0 end) as trigger_count
  from triggers t
)
select anio, fecha, dow,
  case dow when 0 then 'Domingo'::text when 1 then 'Lunes'::text when 2 then 'Martes'::text when 3 then 'Miércoles'::text
           when 4 then 'Jueves'::text when 5 then 'Viernes'::text when 6 then 'Sábado'::text end as dia_semana,
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado, pct_ausentismo,
  pct_capacidad,
  nombre_feriado is not null as es_feriado, nombre_feriado, tipo_feriado,
  trigger_vol, trigger_otif, trigger_aus, trigger_count,
  -- "PPP" / "PP" / "P" / "" según cuántos indicadores cruzaron.
  repeat('P'::text, trigger_count) as codigo,
  -- CRÍTICO = los tres.
  case when trigger_count = 3 then 'CRITICO'::text else 'NORMAL'::text end as estatus,
  -- Escalón de color: CRITICO (PPP) · ATENCION (PP) · NORMAL (P o nada).
  case when trigger_count = 3 then 'CRITICO'::text
       when trigger_count = 2 then 'ATENCION'::text
       else 'NORMAL'::text end as nivel
from final order by anio, fecha;

grant select on v_pc_calendario_dia_multianio to anon, authenticated, service_role;

-- ── Vista del año vigente (la consume /api/.../calendario) ──────────────────
create or replace view v_pc_calendario_dia as
select fecha, dow, dia_semana, mes, hl, hl_rechazo, camiones, clientes_dia,
       pct_rechazo, otif_estimado, pct_ausentismo, pct_capacidad,
       es_feriado, nombre_feriado, tipo_feriado,
       trigger_vol, trigger_otif, trigger_aus, trigger_count, codigo, estatus, nivel, anio
from v_pc_calendario_dia_multianio
where anio = (select anio_vigente from pc_config where id = 1);

grant select on v_pc_calendario_dia to anon, authenticated, service_role;

-- ── Planes de acción: uno por escalón ───────────────────────────────────────
delete from pc_planes_accion where codigo in ('LIMITE', 'CRITICO_ALTO', 'PPPP', 'PPP', 'PP', 'P', '');

insert into pc_planes_accion (codigo, descripcion, plan_texto) values
  ('CRITICO',
   'Crítico (PPP) — volumen, rechazo y ausentismo cruzados el mismo día',
   E'Día que no entra en la flota y además viene con rechazo alto y gente faltando.\n• Máxima dotación: cubrir todas las ausencias del sector de entrega, no otorgar francos.\n• Acumular volumen en los días previos: adelantar pedidos grandes y paletazos para bajar los HL del día.\n• Revisar y priorizar el ruteo con anticipación; reforzar con camión adicional o segunda vuelta.\n• Control de entregas para bajar el rechazo: confirmar pedidos y horarios con los clientes grandes.\n• Coordinación previa con Ventas y seguimiento del avance de carga durante el día.'),
  ('ATENCION',
   'Atención (PP) — dos de los tres indicadores cruzados',
   E'Día que aprieta por dos lados: cualquier imprevisto lo vuelve crítico.\n• Reforzar el recurso de los indicadores en alerta: personal si es ausentismo, control de entregas si es rechazo, ruteo y refuerzo si es volumen.\n• Confirmar la dotación del día anterior; dejar prevista la segunda vuelta.\n• Avisar a Ventas que el día viene cargado.'),
  ('NORMAL',
   'Día normal — un indicador o ninguno',
   E'Operación normal.\n• Sin acción extraordinaria; tenerlo en cuenta al planificar la semana.')
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      plan_texto  = excluded.plan_texto,
      updated_at  = now();

commit;
