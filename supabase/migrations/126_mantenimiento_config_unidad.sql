-- 126: Configuración del "service general" por unidad para el Tablero operativo de
-- mantenimiento. Permite override por unidad de la frecuencia (km / horas / meses)
-- y el km/día estimado para proyectar el vencimiento. Sin fila => se usan los
-- defaults por tipo en código (camión 20.000 km, autoelevador 250 hs).
create table if not exists mantenimiento_config_unidad (
  dominio text primary key references catalogo_vehiculos(dominio) on delete cascade,
  frecuencia_km integer,
  frecuencia_horas integer,
  frecuencia_meses integer,
  km_dia numeric(8,1),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table mantenimiento_config_unidad enable row level security;

create policy mantenimiento_config_unidad_read on mantenimiento_config_unidad
  for select to authenticated using (true);

create policy mantenimiento_config_unidad_write on mantenimiento_config_unidad
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
