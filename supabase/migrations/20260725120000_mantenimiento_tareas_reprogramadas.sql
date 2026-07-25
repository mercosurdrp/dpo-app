-- Tareas del plan que quedaron SIN HACER en un service y se reprograman.
--
-- Caso real (Pampeana, service de camión a los 20.000 km): el service arrastra
-- varias tareas del plan (aceite + filtro, filtro de combustible + trampa de
-- agua, filtro de aire, regulación de frenos, cardán y fluidos). Si el taller no
-- consigue un filtro, esa tarea NO se hizo: hasta ahora la única opción era
-- destildarla y no quedaba rastro de que faltaba. Ahora se registra como
-- "reprogramada" con el motivo y para cuándo (km objetivo y/o fecha), queda
-- abierta y se cierra sola cuando una OT posterior la registre como hecha.
--
-- Tabla SEPARADA de mantenimiento_realizado_tareas a propósito: esa tabla es la
-- fuente de "la tarea se hizo" para el estado del plan (plan-mantenimiento.ts).
-- Una tarea pendiente NO debe contar como realizada ni reiniciar su contador.
--
-- Módulo de mantenimiento = solo Pampeana, pero el esquema se aplica a ambos
-- tenants para mantenerlos en sync (igual que mantenimiento_realizado_repuestos).

create table if not exists mantenimiento_tareas_reprogramadas (
  id                 uuid primary key default gen_random_uuid(),
  -- OT en la que se detectó que la tarea quedaba sin hacer.
  mantenimiento_id   uuid not null references mantenimiento_realizados(id) on delete cascade,
  tarea_id           uuid not null references mantenimiento_plan_tareas(id) on delete cascade,
  dominio            text not null,
  motivo             text,
  -- Para cuándo se reprograma: km objetivo y/o fecha (al menos una, o ninguna
  -- si simplemente "queda para la próxima").
  reprogramada_km    integer check (reprogramada_km >= 0),
  reprogramada_fecha date,
  estado             text not null default 'abierta'
                       check (estado in ('abierta', 'resuelta', 'cancelada')),
  -- OT que finalmente hizo la tarea (queda el rastro de quién la cerró).
  resuelta_mantenimiento_id uuid references mantenimiento_realizados(id) on delete set null,
  resuelta_at        timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists mant_tareas_reprog_mant_idx
  on mantenimiento_tareas_reprogramadas (mantenimiento_id);

create index if not exists mant_tareas_reprog_abiertas_idx
  on mantenimiento_tareas_reprogramadas (dominio, estado);

-- Una sola pendiente ABIERTA por unidad + tarea: si se vuelve a dejar sin hacer
-- la misma tarea, se actualiza la que ya está abierta en lugar de duplicarla.
create unique index if not exists mant_tareas_reprog_unica_abierta_idx
  on mantenimiento_tareas_reprogramadas (dominio, tarea_id)
  where estado = 'abierta';

alter table mantenimiento_tareas_reprogramadas enable row level security;

-- Lectura: cualquier usuario autenticado (igual que mantenimiento_realizados).
drop policy if exists mantenimiento_tareas_reprogramadas_read on mantenimiento_tareas_reprogramadas;
create policy mantenimiento_tareas_reprogramadas_read on mantenimiento_tareas_reprogramadas
  for select using (true);

-- Escritura: solo admin / supervisor.
drop policy if exists mantenimiento_tareas_reprogramadas_write on mantenimiento_tareas_reprogramadas;
create policy mantenimiento_tareas_reprogramadas_write on mantenimiento_tareas_reprogramadas
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role::text = any (array['admin', 'supervisor'])
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role::text = any (array['admin', 'supervisor'])
    )
  );
