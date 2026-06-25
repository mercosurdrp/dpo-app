-- Plan de acción por ítem observado (no OK) del checklist de mantenimiento.
-- Permite documentar qué se trabajó / cómo se reparó el ítem, clasificarlo
-- (correctivo / preventivo / proactivo), llevar su estado y adjuntar una foto.
-- 1 plan por respuesta de checklist (editable) → unique(respuesta_id).
-- Módulo de mantenimiento = solo Pampeana, pero el esquema se aplica a ambos
-- tenants para mantenerlos en sync.

create table if not exists checklist_planes_accion (
  id uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references checklist_respuestas(id) on delete cascade,
  tipo text not null check (tipo in ('correctivo', 'preventivo', 'proactivo')),
  estado text not null default 'resuelto'
    check (estado in ('pendiente', 'en_proceso', 'resuelto')),
  descripcion text not null,
  foto_url text,
  foto_path text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (respuesta_id)
);

create index if not exists idx_checklist_planes_accion_respuesta
  on checklist_planes_accion (respuesta_id);

alter table checklist_planes_accion enable row level security;

-- Lectura: cualquier usuario autenticado (igual que mantenimiento_realizados).
create policy checklist_planes_accion_read on checklist_planes_accion
  for select using (true);

-- Escritura: solo admin / supervisor.
create policy checklist_planes_accion_write on checklist_planes_accion
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
