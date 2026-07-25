-- Rotación / alineación / balanceo como TRES acciones separadas del módulo de
-- neumáticos, con intervalo de km POR TIPO DE UNIDAD.
--
-- Antes: un único intervalo global (`mantenimiento_config.rotacion_km`) para
-- rotación y alineación de toda la flota, y el balanceo no existía como registro
-- propio (iba mezclado en `mantenimiento_alineaciones`).
-- Pedido de Pampeana: las tres se controlan cada 50.000 km SOLO en camiones; el
-- resto de la flota sigue con el intervalo global de 20.000.

-- 1) La alineación distingue qué se hizo: alineación, balanceo o las dos.
alter table mantenimiento_alineaciones
  add column if not exists tipo text not null default 'ambos';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mantenimiento_alineaciones_tipo_check'
  ) then
    alter table mantenimiento_alineaciones
      add constraint mantenimiento_alineaciones_tipo_check
      check (tipo in ('alineacion', 'balanceo', 'ambos'));
  end if;
end $$;

-- Los registros históricos se cargaban desde la sección "Alineación y balanceo".
update mantenimiento_alineaciones set tipo = 'ambos' where tipo is null;

-- 2) Intervalo de km por tipo de unidad y acción. Sin fila = cae al intervalo
--    global de mantenimiento_config.rotacion_km.
create table if not exists mantenimiento_neumaticos_intervalos (
  tipo_vehiculo text not null,
  accion        text not null check (accion in ('rotacion', 'alineacion', 'balanceo')),
  km            integer not null check (km > 0),
  updated_at    timestamptz not null default now(),
  primary key (tipo_vehiculo, accion)
);

insert into mantenimiento_neumaticos_intervalos (tipo_vehiculo, accion, km) values
  ('camion', 'rotacion', 50000),
  ('camion', 'alineacion', 50000),
  ('camion', 'balanceo', 50000)
on conflict (tipo_vehiculo, accion) do nothing;

alter table mantenimiento_neumaticos_intervalos enable row level security;

drop policy if exists mant_neum_intervalos_read on mantenimiento_neumaticos_intervalos;
create policy mant_neum_intervalos_read on mantenimiento_neumaticos_intervalos
  for select using (true);

drop policy if exists mant_neum_intervalos_write on mantenimiento_neumaticos_intervalos;
create policy mant_neum_intervalos_write on mantenimiento_neumaticos_intervalos
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
