-- 145: Inventario y seguimiento de neumáticos de la flota (solo Pampeana).
--   * mantenimiento_neumaticos           -> cada cubierta (stock / instalada / baja)
--   * mantenimiento_neumatico_mediciones -> historial de desgaste (profundidad/presión/km)
--
-- A diferencia de la carga libre de "mantenimiento_llantas" (inspecciones sueltas),
-- esto es un inventario real: numeración, tipo (nuevo/recapado), asignación a una
-- unidad + posición + eje (direccional/tracción), seguimiento de desgaste y bajas.

create table if not exists mantenimiento_neumaticos (
  id                      uuid primary key default gen_random_uuid(),
  numero                  text,                    -- numeración/serie (opcional)
  tipo                    text not null check (tipo in ('nuevo','recapado')),
  marca                   text,
  medida                  text,
  dominio                 text references catalogo_vehiculos(dominio) on delete set null,
  posicion                text,                    -- código de posición del diagrama
  eje                     text check (eje in ('direccional','traccion')),
  profundidad_inicial_mm  numeric(4,1),
  profundidad_actual_mm   numeric(4,1),
  km_instalacion          numeric(10,1),
  estado                  text not null default 'stock'
                            check (estado in ('stock','instalado','baja')),
  motivo_baja             text,
  fecha_ingreso           date not null default current_date,
  fecha_instalacion       date,
  fecha_baja              date,
  observaciones           text,
  created_by              uuid references profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Una sola cubierta instalada por (unidad, posición).
create unique index if not exists mantenimiento_neumaticos_pos_uniq
  on mantenimiento_neumaticos (dominio, posicion)
  where estado = 'instalado' and dominio is not null and posicion is not null;

create index if not exists mantenimiento_neumaticos_dominio_idx
  on mantenimiento_neumaticos (dominio);

create table if not exists mantenimiento_neumatico_mediciones (
  id              uuid primary key default gen_random_uuid(),
  neumatico_id    uuid not null references mantenimiento_neumaticos(id) on delete cascade,
  fecha           date not null default current_date,
  profundidad_mm  numeric(4,1),
  km              numeric(10,1),
  presion_psi     numeric(5,1),
  nota            text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index if not exists mantenimiento_neumatico_mediciones_neum_idx
  on mantenimiento_neumatico_mediciones (neumatico_id, fecha desc);

alter table mantenimiento_neumaticos enable row level security;
alter table mantenimiento_neumatico_mediciones enable row level security;

create policy mantenimiento_neumaticos_read on mantenimiento_neumaticos
  for select to authenticated using (true);
create policy mantenimiento_neumaticos_write on mantenimiento_neumaticos
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));

create policy mantenimiento_neumatico_mediciones_read on mantenimiento_neumatico_mediciones
  for select to authenticated using (true);
create policy mantenimiento_neumatico_mediciones_write on mantenimiento_neumatico_mediciones
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
