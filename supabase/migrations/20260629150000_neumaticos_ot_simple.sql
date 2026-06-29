-- 20260629150000: Mejoras de Neumáticos + OT simple (solo Pampeana).
--   1) Costo y proveedor en las alineaciones/balanceos.
--   2) Entrada/salida del taller con fecha+hora en las órdenes de trabajo
--      (de ahí se deriva el período "fuera de servicio" de la disponibilidad).
--   3) Config global de mantenimiento: intervalo de km de rotación/alineación
--      (antes era una constante 20.000 hardcodeada; ahora editable).

-- 1) Alineaciones: costo + proveedor
alter table mantenimiento_alineaciones
  add column if not exists costo numeric(12,2) check (costo >= 0);
alter table mantenimiento_alineaciones
  add column if not exists proveedor text;

-- 2) OT: entrada / salida del taller con hora
alter table mantenimiento_realizados
  add column if not exists entrada_taller timestamptz;
alter table mantenimiento_realizados
  add column if not exists salida_taller timestamptz;

-- 3) Config global (fila única) de mantenimiento
create table if not exists mantenimiento_config (
  id          boolean primary key default true check (id),
  rotacion_km integer not null default 20000 check (rotacion_km > 0),
  updated_at  timestamptz not null default now()
);

insert into mantenimiento_config (id) values (true)
  on conflict (id) do nothing;

alter table mantenimiento_config enable row level security;

drop policy if exists mantenimiento_config_read on mantenimiento_config;
create policy mantenimiento_config_read on mantenimiento_config
  for select to authenticated using (true);

drop policy if exists mantenimiento_config_write on mantenimiento_config;
create policy mantenimiento_config_write on mantenimiento_config
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
