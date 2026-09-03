-- 145_pc_swot_revisiones.sql
-- DPO 3.4 / R3.4.3: revisión del FODA ítem por ítem cuando termina un período.
--
-- Hasta ahora la evidencia eran dos fotos completas del FODA ("previo" y
-- "posterior") que había que comparar a ojo. A Sebastián no le sirve para
-- trabajar: quiere UN solo FODA y, cuando pasa un período, ver qué fortaleza,
-- debilidad, oportunidad o amenaza cambió. La revisión registra eso mismo:
-- por cada ítem, si se mantuvo, se modificó (con el texto anterior y el nuevo)
-- o se eliminó, y qué ítems nuevos aparecieron. El historial por período ES la
-- evidencia de R3.4.3 ("analiza y realiza cambios en el FODA").
--
-- pc_swot_snapshots queda como respaldo automático: al cerrar una revisión la
-- app congela el FODA resultante como foto "posterior" del período.

begin;

create table if not exists pc_swot_revisiones (
  id                   uuid primary key default gen_random_uuid(),
  periodo_nombre       text not null,
  periodo_anio         integer not null,
  periodo_fecha_inicio date,
  periodo_fecha_fin    date,
  -- Fecha en que el equipo hizo la revisión (no la de carga).
  fecha                date not null default current_date,
  nota                 text not null default '',
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_pc_swot_revisiones_fecha
  on pc_swot_revisiones (fecha desc, created_at desc);

create table if not exists pc_swot_revision_items (
  id              uuid primary key default gen_random_uuid(),
  revision_id     uuid not null references pc_swot_revisiones(id) on delete cascade,
  -- El ítem del FODA. Null si el ítem ya no existe en la tabla (histórico viejo).
  item_id         uuid references pc_swot_items(id) on delete set null,
  categoria       text not null check (categoria in ('F','O','D','A')),
  -- mantiene = sigue igual · modifica = cambió texto/acción · elimina = ya no aplica · agrega = nuevo
  accion          text not null check (accion in ('mantiene','modifica','elimina','agrega')),
  texto_anterior  text,
  accion_anterior text,
  texto_nuevo     text,
  accion_nuevo    text,
  nota            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists idx_pc_swot_revision_items_revision
  on pc_swot_revision_items (revision_id);
create index if not exists idx_pc_swot_revision_items_item
  on pc_swot_revision_items (item_id, created_at desc);

-- RLS igual que el resto del módulo: lee cualquier autenticado, escribe
-- admin / admin_rrhh / supervisor.
do $$
declare t text;
  tablas text[] := array['pc_swot_revisiones','pc_swot_revision_items'];
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

grant select, insert, update, delete on pc_swot_revisiones, pc_swot_revision_items to authenticated, service_role;

commit;
