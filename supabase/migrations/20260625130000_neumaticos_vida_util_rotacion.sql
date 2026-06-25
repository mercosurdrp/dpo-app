-- Vida útil estimada de neumáticos + rotaciones.
-- (a) vida_util_km: objetivo de km de la cubierta (se setea al instalar, según
--     tipo nuevo/recapado; editable). Desde ahí se estima km/días restantes.
-- (b) mantenimiento_rotaciones: registro de rotaciones por unidad (como las
--     alineaciones) para el contador de próxima rotación.
-- Módulo de mantenimiento = solo Pampeana, pero el esquema va a ambos tenants.

alter table mantenimiento_neumaticos
  add column if not exists vida_util_km numeric(10, 1);

create table if not exists mantenimiento_rotaciones (
  id             uuid primary key default gen_random_uuid(),
  dominio        text not null references catalogo_vehiculos(dominio) on delete cascade,
  fecha          date not null,
  km             numeric(10, 1),
  proxima_fecha  date,
  proxima_km     numeric(10, 1),
  observaciones  text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists mantenimiento_rotaciones_dominio_idx
  on mantenimiento_rotaciones (dominio, fecha desc);

alter table mantenimiento_rotaciones enable row level security;

create policy mantenimiento_rotaciones_read on mantenimiento_rotaciones
  for select using (true);

create policy mantenimiento_rotaciones_write on mantenimiento_rotaciones
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
