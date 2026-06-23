-- 152: Indisponibilidades de flota por causa NO de mantenimiento (estado IND).
--   Ej.: sin chofer, siniestro, documentación vencida, etc. Cuenta como "no
--   disponible" en el Seguimiento de flota, aparte de las paradas por OT (PMC/PMP).
create table if not exists flota_indisponibilidad (
  id           uuid primary key default gen_random_uuid(),
  dominio      text not null references catalogo_vehiculos(dominio) on delete cascade,
  fecha_desde  date not null,
  fecha_hasta  date not null,
  motivo       text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists flota_indisponibilidad_dominio_idx
  on flota_indisponibilidad (dominio, fecha_desde);

alter table flota_indisponibilidad enable row level security;

create policy flota_indisponibilidad_read on flota_indisponibilidad
  for select to authenticated using (true);
create policy flota_indisponibilidad_write on flota_indisponibilidad
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
