-- 149: Control de alineaciones por unidad (solo Pampeana).
--   Registro histórico de alineaciones de cada camión: fecha + km de la alineación,
--   próxima programada (fecha/km) y observaciones. El semáforo (al día / por vencer /
--   vencida) se calcula en el front a partir de proxima_fecha.

create table if not exists mantenimiento_alineaciones (
  id             uuid primary key default gen_random_uuid(),
  dominio        text not null references catalogo_vehiculos(dominio) on delete cascade,
  fecha          date not null default current_date,
  km             numeric(10,1),
  proxima_fecha  date,
  proxima_km     numeric(10,1),
  observaciones  text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists mantenimiento_alineaciones_dominio_idx
  on mantenimiento_alineaciones (dominio, fecha desc);

alter table mantenimiento_alineaciones enable row level security;

create policy mantenimiento_alineaciones_read on mantenimiento_alineaciones
  for select to authenticated using (true);
create policy mantenimiento_alineaciones_write on mantenimiento_alineaciones
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
