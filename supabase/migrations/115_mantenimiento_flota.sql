-- 115_mantenimiento_flota.sql
-- Plan de mantenimiento preventivo/correctivo de la flota (/vehiculos/mantenimiento).
--
-- Modelo:
--   * mantenimiento_plan_tareas      -> plantilla del plan por tipo de vehículo
--                                       (frecuencia por km y/o meses y/o horas; vence lo que ocurra primero)
--   * mantenimiento_plan_overrides   -> ajuste de frecuencias (o exclusión) por unidad
--   * mantenimiento_realizados       -> evento de mantenimiento (cabecera)
--   * mantenimiento_realizado_tareas -> tareas incluidas en cada evento
--
-- El "próximo vencimiento" NO se persiste: se deriva del último realizado
-- completado + frecuencia efectiva (override ?? plantilla) contra el km actual
-- reconstruido de registros_vehiculos/checklist_vehiculos/registro_combustible.
--
-- RLS: read = authenticated; write = admin/supervisor (rol comparado como text
-- para no depender del enum user_role, que difiere entre proyectos).

begin;

-- ───────────────────────── Plantilla del plan ─────────────────────────
create table if not exists mantenimiento_plan_tareas (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null,
  nombre           text not null,
  categoria        text not null check (categoria in
                     ('motor','frenos','neumaticos','electrico','hidraulico','general','documentacion')),
  tipo_vehiculo    text not null check (tipo_vehiculo in
                     ('camion','camioneta','autoelevador','utilitario')),
  frecuencia_km    integer check (frecuencia_km > 0),
  frecuencia_meses integer check (frecuencia_meses > 0),
  frecuencia_horas integer check (frecuencia_horas > 0),
  activo           boolean not null default true,
  orden            integer not null default 0,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint mantenimiento_plan_tareas_frecuencia_check
    check (frecuencia_km is not null or frecuencia_meses is not null or frecuencia_horas is not null),
  constraint mantenimiento_plan_tareas_codigo_tipo_unique unique (codigo, tipo_vehiculo)
);

-- ───────────────────────── Overrides por unidad ─────────────────────────
create table if not exists mantenimiento_plan_overrides (
  id               uuid primary key default gen_random_uuid(),
  dominio          text not null,
  tarea_id         uuid not null references mantenimiento_plan_tareas(id) on delete cascade,
  frecuencia_km    integer check (frecuencia_km > 0),
  frecuencia_meses integer check (frecuencia_meses > 0),
  frecuencia_horas integer check (frecuencia_horas > 0),
  activo           boolean not null default true,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint mantenimiento_plan_overrides_unique unique (dominio, tarea_id)
);

-- ───────────────────────── Mantenimientos realizados ─────────────────────────
create table if not exists mantenimiento_realizados (
  id             uuid primary key default gen_random_uuid(),
  dominio        text not null,
  fecha          date not null,
  odometro       integer check (odometro >= 0),
  horometro      numeric(10,1) check (horometro >= 0),
  tipo           text not null check (tipo in ('preventivo','correctivo')),
  estado         text not null default 'completado'
                   check (estado in ('programado','en_taller','completado','cancelado')),
  taller         text,
  costo          numeric(12,2) check (costo >= 0),
  numero_factura text,
  observaciones  text,
  evidencia_urls text[],
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists mantenimiento_realizados_dominio_fecha_idx
  on mantenimiento_realizados (dominio, fecha desc);
create index if not exists mantenimiento_realizados_estado_idx
  on mantenimiento_realizados (estado);

create table if not exists mantenimiento_realizado_tareas (
  id               uuid primary key default gen_random_uuid(),
  mantenimiento_id uuid not null references mantenimiento_realizados(id) on delete cascade,
  tarea_id         uuid references mantenimiento_plan_tareas(id) on delete set null,
  descripcion      text,
  costo            numeric(12,2) check (costo >= 0),
  created_at       timestamptz not null default now(),
  constraint mantenimiento_realizado_tareas_desc_check
    check (tarea_id is not null or descripcion is not null)
);

create unique index if not exists mantenimiento_realizado_tareas_unique
  on mantenimiento_realizado_tareas (mantenimiento_id, tarea_id)
  where tarea_id is not null;
create index if not exists mantenimiento_realizado_tareas_tarea_idx
  on mantenimiento_realizado_tareas (tarea_id);

-- ───────────────────────── RLS ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'mantenimiento_plan_tareas',
    'mantenimiento_plan_overrides',
    'mantenimiento_realizados',
    'mantenimiento_realizado_tareas'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %I on %I for select to authenticated using (true)
    $f$, t||'_read', t);
    execute format($f$
      create policy %I on %I for all to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid()
                     and p.role::text = any (array['admin','supervisor'])))
      with check (exists (select 1 from profiles p where p.id = auth.uid()
                     and p.role::text = any (array['admin','supervisor'])))
    $f$, t||'_write', t);
  end loop;
end $$;

-- ───────────────────────── Seed del plan preventivo ─────────────────────────
-- Valores iniciales estándar, editables desde la app (tab Plantillas).

insert into mantenimiento_plan_tareas
  (codigo, nombre, categoria, tipo_vehiculo, frecuencia_km, frecuencia_meses, frecuencia_horas, orden)
values
  -- Camión diésel de reparto
  ('aceite_motor',      'Aceite motor + filtro de aceite',                'motor',         'camion', 10000,  6, null, 10),
  ('filtro_combustible','Filtro de combustible + trampa de agua',         'motor',         'camion', 20000, 12, null, 20),
  ('filtro_aire',       'Filtro de aire',                                 'motor',         'camion', 20000, 12, null, 30),
  ('engrase_general',   'Engrase general (crucetas, puntas de eje)',      'general',       'camion', 10000,  6, null, 40),
  ('frenos',            'Frenos: cintas/pastillas y regulación',          'frenos',        'camion', 20000,  6, null, 50),
  ('neumaticos',        'Neumáticos: rotación + control desgaste/presión','neumaticos',    'camion', 10000,  6, null, 60),
  ('tren_delantero',    'Tren delantero + alineación y balanceo',         'general',       'camion', 20000, 12, null, 70),
  ('correas',           'Correas',                                        'motor',         'camion', 40000, 24, null, 80),
  ('bateria_luces',     'Batería, alternador y luces',                    'electrico',     'camion', null,   6, null, 90),
  ('refrigerante',      'Líquido refrigerante (cambio)',                  'motor',         'camion', 40000, 24, null, 100),
  ('aceite_caja_dif',   'Aceite de caja y diferencial',                   'motor',         'camion', 60000, 24, null, 110),
  ('vtv',               'VTV',                                            'documentacion', 'camion', null,  12, null, 120),
  ('matafuego',         'Matafuego: recarga/vencimiento',                 'documentacion', 'camion', null,  12, null, 130),
  -- Camioneta
  ('aceite_motor',      'Aceite motor + filtro de aceite',                'motor',         'camioneta', 10000, 12, null, 10),
  ('filtro_combustible','Filtro de combustible',                          'motor',         'camioneta', 20000, 12, null, 20),
  ('filtro_aire',       'Filtro de aire',                                 'motor',         'camioneta', 20000, 12, null, 30),
  ('frenos',            'Frenos: pastillas/discos',                       'frenos',        'camioneta', 20000, 12, null, 40),
  ('neumaticos',        'Neumáticos: rotación + control desgaste/presión','neumaticos',    'camioneta', 10000,  6, null, 50),
  ('bateria_luces',     'Batería y luces',                                'electrico',     'camioneta', null,   6, null, 60),
  ('vtv',               'VTV',                                            'documentacion', 'camioneta', null,  12, null, 70),
  ('matafuego',         'Matafuego: recarga/vencimiento',                 'documentacion', 'camioneta', null,  12, null, 80),
  -- Autoelevador (por horas, fallback por meses si no hay horómetro)
  ('aceite_motor',      'Aceite motor + filtro de aceite',                'motor',         'autoelevador', null,  3,  250, 10),
  ('engrase_mastil',    'Engrase de mástil y cadenas',                    'general',       'autoelevador', null,  3,  250, 20),
  ('filtro_aire',       'Limpieza/cambio filtro de aire',                 'motor',         'autoelevador', null,  3,  250, 30),
  ('filtro_combustible','Filtro de combustible',                          'motor',         'autoelevador', null,  6,  500, 40),
  ('filtro_hidraulico', 'Filtro hidráulico',                              'hidraulico',    'autoelevador', null,  6,  500, 50),
  ('frenos_direccion',  'Revisión de frenos y dirección',                 'frenos',        'autoelevador', null,  6,  500, 60),
  ('aceite_hidraulico', 'Aceite hidráulico',                              'hidraulico',    'autoelevador', null, 12, 1000, 70),
  ('aceite_transmision','Aceite de transmisión',                          'motor',         'autoelevador', null, 12, 1000, 80),
  ('refrigerante',      'Líquido refrigerante',                           'motor',         'autoelevador', null, 12, 1000, 90),
  ('horquillas_cadenas','Inspección de horquillas y cadenas (desgaste)',  'general',       'autoelevador', null, 12, 1000, 100),
  ('bateria_luces',     'Batería y luces',                                'electrico',     'autoelevador', null,  6, null, 110)
on conflict (codigo, tipo_vehiculo) do nothing;

commit;
