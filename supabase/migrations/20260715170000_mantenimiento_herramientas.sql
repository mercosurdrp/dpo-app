-- Herramientas de taller: registro simple de las herramientas del pañol de
-- mantenimiento (nombre, cantidad, estado, ubicación). Vive como una solapa más
-- del módulo de mantenimiento de flota (solo Pampeana).
--
-- RLS: lectura para autenticados; escritura para admin/supervisor.
-- (Los datos ya vienen cargados en prod; esta migración solo deja el esquema
-- consistente con la base — NO incluye los INSERT.)

create table if not exists mantenimiento_herramientas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cantidad integer not null default 1,
  estado text,
  ubicacion text,
  notas text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table mantenimiento_herramientas enable row level security;

-- Idempotente: la tabla y sus policies ya existen en prod (se aplicaron por MCP);
-- el drop/create evita que un futuro `db push` de este archivo falle.
drop policy if exists mantenimiento_herramientas_read on mantenimiento_herramientas;
create policy mantenimiento_herramientas_read on mantenimiento_herramientas
  for select to authenticated using (true);

drop policy if exists mantenimiento_herramientas_write on mantenimiento_herramientas;
create policy mantenimiento_herramientas_write on mantenimiento_herramientas
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from profiles p where p.id = auth.uid()
                      and p.role::text = any (array['admin','supervisor'])));
