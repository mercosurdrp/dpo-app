-- 108_periodos_criticos_pampeana.sql
-- Porteo del módulo Períodos Críticos (Planeamiento R3.4) desde Misiones a Pampeana.
--
-- Origen: dpo-distribuciones (rama distribuciones), migraciones 080/083/085-098.
-- Esta migración consolida el ESTADO FINAL vivo en Misiones (extraído por
-- introspección de la DB el 2026-06-10), adaptado a las fuentes de datos de
-- Pampeana:
--   * Volumen diario  -> ventas_diarias.total_hl  (en HL; en Misiones venía de
--                        un cron Foxtrot en bultos). El cron de Pampeana llenará
--                        pc_volumen_diario con HL/clientes/OTIF desde Chess+GESCOM.
--   * OTIF            -> derivado de rechazos (hl_rechazados / hl). "OTIF = rechazo".
--   * Ausentismo      -> carga Excel manual (pc_ausentismo_mensual).
--
-- Diferencia clave con Misiones: la vista hace FALLBACK a ventas_diarias y
-- rechazos, de modo que la herramienta funciona en Pampeana ANTES de que corra
-- el cron (clientes_dia queda en 0 hasta que el cron lo provea).
--
-- Dependencias preexistentes en Pampeana (verificadas): profiles(id),
-- reuniones(id), enum user_role (admin/admin_rrhh/supervisor), ventas_diarias,
-- rechazos, buckets storage 'reuniones' y 'evidencias'.
--
-- RLS uniforme: read = authenticated; write = profiles.role IN (admin, admin_rrhh, supervisor).

begin;

-- ───────────────────────── Configuración (singleton) ─────────────────────────
create table if not exists pc_config (
  id            integer primary key default 1 check (id = 1),
  anio_vigente  integer not null default 2026,
  w_vol         numeric not null default 0.500,
  w_otif        numeric not null default 0.300,
  w_aus         numeric not null default 0.200,
  umbral_alto   numeric not null default 0.750,
  umbral_medio  numeric not null default 0.250,
  hl_p90_2025   numeric,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles(id) on delete set null,
  constraint pc_config_check  check (abs(((w_vol + w_otif + w_aus) - 1.0)) < 0.001),
  constraint pc_config_check1 check (umbral_alto > umbral_medio)
);

-- Umbrales de los 4 triggers (singleton). Valores calibrados a HL de Pampeana
-- (distribución 2026: p50≈345, p90≈670, p95≈846, máx≈1498). Recalibrar tras
-- backfillear el volumen 2025 y cargar el ausentismo real.
create table if not exists pc_umbrales (
  id             integer primary key default 1 check (id = 1),
  vol_pico       numeric not null default 800.00,
  vol_alto       numeric not null default 600.00,
  vol_medio      numeric not null default 400.00,
  clientes       integer not null default 250,
  otif_min       numeric not null default 0.920,
  ausentismo_max numeric not null default 0.075,
  min_triggers   integer not null default 2 check (min_triggers >= 1 and min_triggers <= 4),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id) on delete set null,
  constraint pc_umbrales_check check (vol_pico >= vol_alto and vol_alto >= vol_medio)
);

-- ───────────────────────── Datos de entrada ─────────────────────────
-- Volumen diario (primario = cron Chess+GESCOM). Las columnas *_distribuidos /
-- otif_distribuido son las que consume la vista; hl_total/bultos_total/clientes_dia
-- son legacy del seed histórico de Misiones (se conservan por compatibilidad).
create table if not exists pc_volumen_diario (
  fecha                 date primary key,
  hl_total              numeric not null default 0,
  hl_rechazo            numeric not null default 0,
  bultos_total          numeric not null default 0,
  camiones              integer not null default 0,
  created_at            timestamptz not null default now(),
  clientes_dia          integer not null default 0,
  bultos_distribuidos   numeric,   -- en Pampeana = HL distribuido del día
  clientes_distribuidos integer,
  otif_distribuido      numeric
);

create table if not exists pc_ausentismo_mensual (
  anio           integer not null check (anio >= 2024 and anio <= 2035),
  mes            integer not null check (mes >= 1 and mes <= 12),
  pct_ausentismo numeric not null check (pct_ausentismo >= 0 and pct_ausentismo <= 1),
  total_planta   integer,
  total_ausentes numeric,
  comentario     text,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid references profiles(id) on delete set null,
  primary key (anio, mes)
);

create table if not exists pc_feriados (
  fecha  date primary key,
  nombre text not null,
  tipo   text not null default 'nacional'
);

-- ───────────────────────── Planificación / análisis ─────────────────────────
create table if not exists pc_planes_accion (
  codigo      text primary key,           -- 'PPPP'..'P' (combinación de triggers)
  descripcion text not null default '',
  plan_texto  text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

create table if not exists pc_periodos_foco (
  id           uuid primary key default gen_random_uuid(),
  anio         integer not null,
  nombre       text not null,
  fecha_inicio date not null,
  fecha_fin    date not null,
  foco         text not null default '',
  prioridad    text not null default 'media' check (prioridad in ('alta','media','baja')),
  origen       text,
  orden        integer not null default 0,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_pc_periodos_foco_anio on pc_periodos_foco (anio);

create table if not exists pc_escenarios (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  descripcion      text,
  fecha_base       date not null,
  delta_volumen    numeric not null default 0,
  delta_otif       numeric not null default 0,
  delta_ausentismo numeric not null default 0,
  resultado_score  numeric,
  resultado_nivel  text,
  created_at       timestamptz not null default now(),
  created_by       uuid references profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  delta_clientes   numeric not null default 0
);
create index if not exists idx_pc_escenarios_fecha_base on pc_escenarios (fecha_base desc);

-- ───────────────────────── Revisión mensual (R3.4.2) ─────────────────────────
create table if not exists pc_revisiones_mensuales (
  id                 uuid primary key default gen_random_uuid(),
  anio               integer not null,
  mes                integer not null check (mes >= 1 and mes <= 12),
  reunion_id         uuid references reuniones(id) on delete set null,
  conclusiones       text not null default '',
  periodos_revisados jsonb not null default '[]'::jsonb,
  estado             text not null default 'realizada' check (estado in ('pendiente','realizada')),
  realizada_por      uuid references profiles(id) on delete set null,
  realizada_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (anio, mes)
);
create index if not exists idx_pc_revisiones_anio_mes on pc_revisiones_mensuales (anio, mes);

create table if not exists pc_revision_evidencias (
  id             uuid primary key default gen_random_uuid(),
  revision_id    uuid not null references pc_revisiones_mensuales(id) on delete cascade,
  comentario     text,
  archivo_path   text,
  archivo_nombre text,
  archivo_mime   text,
  archivo_bytes  bigint,
  autor_id       uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint pc_revision_evid_payload_chk
    check ((coalesce(btrim(comentario), '') <> '') or (archivo_path is not null))
);
create index if not exists idx_pc_revision_evid_revision on pc_revision_evidencias (revision_id);

-- ───────────────────────── FODA / SWOT (R3.4.3) ─────────────────────────
create table if not exists pc_swot_items (
  id                   uuid primary key default gen_random_uuid(),
  categoria            text not null check (categoria in ('F','O','D','A')),
  texto                text not null,
  impacto              text not null default 'medio' check (impacto in ('alto','medio','bajo')),
  accion_recomendada   text not null default '',
  periodo_nombre       text,
  periodo_anio         integer,
  periodo_fecha_inicio date,
  periodo_fecha_fin    date,
  orden                integer not null default 0,
  activo               boolean not null default true,
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_pc_swot_items_activo on pc_swot_items (activo);
create index if not exists idx_pc_swot_items_anio   on pc_swot_items (periodo_anio);

-- ───────────────────────── Incentivos temporada alta (R3.4.4) ─────────────────────────
create table if not exists pc_incentivos_programa (
  id                integer primary key default 1 constraint pc_incentivos_programa_singleton check (id = 1),
  nombre            text not null default 'Programa de Incentivos de Verano',
  periodo           text not null default 'Diciembre – Febrero',
  descripcion       text not null default '',
  archivo_path      text,
  archivo_nombre    text,
  comunicado        boolean not null default false,
  comunicado_fecha  date,
  comunicado_path   text,
  comunicado_nombre text,
  comunicado_nota   text,
  updated_at        timestamptz not null default now(),
  comunicado_link   text
);

create table if not exists pc_incentivos_registro (
  id           uuid primary key default gen_random_uuid(),
  anio         integer not null,
  mes          integer not null check (mes >= 1 and mes <= 12),
  ambito       text not null default 'Choferes',
  equipo       text,
  cumplio      boolean,
  posicion     text,
  premio       text,
  nota         text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foto_path    text,
  foto_nombre  text
);
create index if not exists idx_pc_incentivos_registro_periodo on pc_incentivos_registro (anio, mes);

-- ───────────────────────── Temario reunión logística-ventas (R2.1.5.3) ─────────────────────────
create table if not exists pc_temario_items (
  id         uuid primary key default gen_random_uuid(),
  bloque     text not null,
  titulo     text not null,
  url        text,
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pc_temario_items_orden on pc_temario_items (orden);

-- ═══════════════════════════ VISTAS ═══════════════════════════
-- Motor de cálculo: combina pc_volumen_diario (primario) con ventas_diarias y
-- rechazos (fallback). 4 triggers booleanos -> trigger_count -> código PPPP -> estatus.
create or replace view v_pc_calendario_dia_multianio as
with cfg as (
  select c.w_vol, c.w_otif, c.w_aus,
         c.umbral_alto as umbral_score_alto,
         c.umbral_medio as umbral_score_medio,
         coalesce(nullif(c.hl_p90_2025, 0::numeric), 1::numeric) as hl_p90,
         u.vol_pico, u.vol_alto, u.vol_medio,
         u.clientes as umbral_clientes,
         u.otif_min, u.ausentismo_max, u.min_triggers
  from pc_config c cross join pc_umbrales u
  where c.id = 1 and u.id = 1
),
anios as (
  select generate_series(2024, extract(year from current_date)::integer + 1) as anio
),
fechas as (
  select a.anio,
         generate_series(make_date(a.anio,1,1)::timestamptz, make_date(a.anio,12,31)::timestamptz, '1 day'::interval)::date as fecha
  from anios a
),
ventas_dia as (
  select fecha, sum(total_hl) as hl_real, count(distinct ds_fletero_carga) as camiones
  from ventas_diarias group by fecha
),
rech_dia as (
  select fecha, sum(hl_rechazados) as hl_rech
  from rechazos group by fecha
),
crudo as (
  select f.anio, f.fecha,
         extract(dow from f.fecha)::integer as dow,
         extract(month from f.fecha)::integer as mes,
         -- HL del día: cron primero, ventas_diarias como fallback
         coalesce(h.bultos_distribuidos, v.hl_real, 0::numeric) as hl,
         coalesce(h.hl_rechazo, r.hl_rech, 0::numeric) as hl_rechazo,
         coalesce(nullif(h.camiones, 0)::bigint, v.camiones, 0::bigint)::integer as camiones,
         coalesce(h.clientes_distribuidos, 0) as clientes_dia,
         -- OTIF: cron primero; si no, derivado de rechazos (1 - hl_rech/hl)
         coalesce(
           h.otif_distribuido,
           case when coalesce(h.bultos_distribuidos, v.hl_real, 0) > 0
                then 1.0 - coalesce(h.hl_rechazo, r.hl_rech, 0) / nullif(coalesce(h.bultos_distribuidos, v.hl_real, 0), 0)
                else null end
         ) as otif_dist,
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
  select c.*,
         1::numeric - coalesce(c.otif_dist, 1.0) as pct_rechazo,
         coalesce(c.otif_dist, 1.0) as otif_estimado,
         case
           when c.hl >= (select vol_pico from cfg)  then 'PICO'
           when c.hl >= (select vol_alto from cfg)  then 'ALTO'
           when c.hl >= (select vol_medio from cfg) then 'MEDIO'
           else 'BAJO'
         end as clasif_vol
  from crudo c
),
triggers as (
  select c.*,
         c.clasif_vol = 'PICO' as trigger_vol,
         c.clientes_dia > (select umbral_clientes from cfg) as trigger_cli,
         c.otif_dist is not null and c.otif_dist < (select otif_min from cfg) as trigger_otif,
         c.pct_ausentismo >= (select ausentismo_max from cfg) as trigger_aus
  from calc c
),
final as (
  select t.*,
         (case when t.trigger_otif then 'P' else '' end ||
          case when t.trigger_vol  then 'P' else '' end ||
          case when t.trigger_cli  then 'P' else '' end ||
          case when t.trigger_aus  then 'P' else '' end) as codigo,
         (case when t.trigger_otif then 1 else 0 end +
          case when t.trigger_vol  then 1 else 0 end +
          case when t.trigger_cli  then 1 else 0 end +
          case when t.trigger_aus  then 1 else 0 end) as trigger_count
  from triggers t
),
scored as (
  select f.*,
         case when f.dow = 0 then 0::numeric
              else least(2.0,
                   (select w_vol from cfg) * (f.hl / (select hl_p90 from cfg))
                 + (select w_otif from cfg) * f.pct_rechazo
                 + (select w_aus from cfg) * f.pct_ausentismo)
         end as score
  from final f
)
select
  anio, fecha, dow,
  case dow when 0 then 'Domingo' when 1 then 'Lunes' when 2 then 'Martes'
           when 3 then 'Miércoles' when 4 then 'Jueves' when 5 then 'Viernes'
           when 6 then 'Sábado' end as dia_semana,
  mes, hl, hl_rechazo, camiones, clientes_dia, pct_rechazo, otif_estimado,
  pct_ausentismo, clasif_vol,
  nombre_feriado is not null as es_feriado, nombre_feriado, score,
  trigger_vol, trigger_cli, trigger_otif, trigger_aus, trigger_count, codigo,
  case when dow = 0 then 'NORMAL'
       when trigger_count >= (select min_triggers from cfg) then 'CRITICO'
       else 'NORMAL' end as estatus,
  case when dow = 0 then 'BAJO'
       when score >= (select umbral_score_alto from cfg)  then 'ALTO'
       when score >= (select umbral_score_medio from cfg) then 'MEDIO'
       else 'BAJO' end as nivel
from scored
order by anio, fecha;

create or replace view v_pc_calendario_dia as
select fecha, dow, dia_semana, mes, hl, hl_rechazo, camiones, clientes_dia,
       pct_rechazo, otif_estimado, pct_ausentismo, clasif_vol, es_feriado,
       nombre_feriado, score, trigger_vol, trigger_cli, trigger_otif, trigger_aus,
       trigger_count, codigo, estatus, nivel, anio
from v_pc_calendario_dia_multianio
where anio = (select anio_vigente from pc_config where id = 1);

-- ═══════════════════════════ RLS ═══════════════════════════
-- read = authenticated; write = admin/admin_rrhh/supervisor.
do $$
declare t text;
  tablas text[] := array[
    'pc_config','pc_umbrales','pc_volumen_diario','pc_ausentismo_mensual','pc_feriados',
    'pc_planes_accion','pc_periodos_foco','pc_escenarios','pc_revisiones_mensuales',
    'pc_revision_evidencias','pc_swot_items','pc_incentivos_programa',
    'pc_incentivos_registro','pc_temario_items'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_read', t);
    execute format('drop policy if exists %I on %I', t||'_write', t);
    execute format($f$
      create policy %I on %I for select to authenticated using (true)
    $f$, t||'_read', t);
    execute format($f$
      create policy %I on %I for all to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid()
                     and p.role = any (array['admin','admin_rrhh','supervisor']::user_role[])))
      with check (exists (select 1 from profiles p where p.id = auth.uid()
                     and p.role = any (array['admin','admin_rrhh','supervisor']::user_role[])))
    $f$, t||'_write', t);
  end loop;
end $$;

-- ═══════════════════════════ SEEDS (singletons) ═══════════════════════════
-- Config: pesos del score + año vigente. hl_p90_2025 provisional (p90 de 2026);
-- recalcular tras backfillear el volumen 2025.
insert into pc_config (id, anio_vigente, w_vol, w_otif, w_aus, umbral_alto, umbral_medio, hl_p90_2025)
values (1, 2026, 0.500, 0.300, 0.200, 0.750, 0.250, 670)
on conflict (id) do nothing;

-- Umbrales calibrados a HL de Pampeana (provisionales; recalibrar con datos 2025
-- y ausentismo real). vol_pico≈p95, vol_alto≈p90, vol_medio entre p50 y p90.
insert into pc_umbrales (id, vol_pico, vol_alto, vol_medio, clientes, otif_min, ausentismo_max, min_triggers)
values (1, 850, 670, 450, 300, 0.920, 0.050, 2)
on conflict (id) do nothing;

insert into pc_incentivos_programa (id) values (1) on conflict (id) do nothing;

commit;
