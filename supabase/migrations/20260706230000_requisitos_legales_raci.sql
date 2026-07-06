-- RACI de Requisitos Legales (DPO Planeamiento 2.1, R2.1.1)
-- Matriz de roles y responsabilidades para mantener el derecho a operar.

create table if not exists requisitos_legales_raci_roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists requisitos_legales_raci_filas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  orden integer not null default 0,
  activa boolean not null default true,
  -- { "<rol_id>": "R" | "A" | "C" | "I" }
  asignaciones jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger requisitos_legales_raci_filas_updated_at
  before update on requisitos_legales_raci_filas
  for each row execute function update_updated_at();

alter table requisitos_legales_raci_roles enable row level security;
alter table requisitos_legales_raci_filas enable row level security;

create policy req_legales_raci_roles_select_auth
  on requisitos_legales_raci_roles for select using (true);

create policy req_legales_raci_roles_write_editors
  on requisitos_legales_raci_roles for all
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = any (array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])
  ))
  with check (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = any (array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])
  ));

create policy req_legales_raci_filas_select_auth
  on requisitos_legales_raci_filas for select using (true);

create policy req_legales_raci_filas_write_editors
  on requisitos_legales_raci_filas for all
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = any (array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])
  ))
  with check (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = any (array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])
  ));

-- Seed inicial (matriz acordada 2026-07-06)
insert into requisitos_legales_raci_roles (id, nombre, orden) values
  ('a1b2c3d4-0001-4000-8000-000000000001', 'Gerente Distribuidor', 10),
  ('a1b2c3d4-0001-4000-8000-000000000002', 'Jefe de Logística', 20),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'Supervisor de Flota', 30),
  ('a1b2c3d4-0001-4000-8000-000000000004', 'Supervisor de Depósito', 40),
  ('a1b2c3d4-0001-4000-8000-000000000005', 'RRHH', 50),
  ('a1b2c3d4-0001-4000-8000-000000000006', 'Téc. Seguridad e Higiene', 60),
  ('a1b2c3d4-0001-4000-8000-000000000007', 'Administración', 70)
on conflict (id) do nothing;

insert into requisitos_legales_raci_filas (nombre, descripcion, orden, asignaciones) values
  (
    'Habilitaciones municipales / provinciales',
    'Habilitación de establecimiento, REBA',
    10,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000007":"R","a1b2c3d4-0001-4000-8000-000000000002":"I"}'::jsonb
  ),
  (
    'Seguridad e higiene',
    'Estudios HSMA, extintores (depósito, camiones, autoelevadores), bomberos',
    20,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000006":"R","a1b2c3d4-0001-4000-8000-000000000007":"C","a1b2c3d4-0001-4000-8000-000000000002":"I","a1b2c3d4-0001-4000-8000-000000000004":"I"}'::jsonb
  ),
  (
    'Ambientales',
    'Residuos, efluentes',
    30,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000002":"R","a1b2c3d4-0001-4000-8000-000000000004":"R","a1b2c3d4-0001-4000-8000-000000000006":"C"}'::jsonb
  ),
  (
    'Flota',
    'VTV, seguros vehiculares, SENASA, licencias de conducir, extintores de camiones',
    40,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000003":"R","a1b2c3d4-0001-4000-8000-000000000007":"C","a1b2c3d4-0001-4000-8000-000000000002":"I"}'::jsonb
  ),
  (
    'Laborales',
    'ART, exámenes médicos',
    50,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000005":"R","a1b2c3d4-0001-4000-8000-000000000007":"C","a1b2c3d4-0001-4000-8000-000000000006":"C"}'::jsonb
  ),
  (
    'Comerciales / bromatología',
    'Carnet de manipulación de alimentos',
    60,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000007":"R","a1b2c3d4-0001-4000-8000-000000000005":"C","a1b2c3d4-0001-4000-8000-000000000002":"I"}'::jsonb
  ),
  (
    'Documentación de proveedores',
    'Seguros y habilitaciones de terceros que operan en el sitio',
    70,
    '{"a1b2c3d4-0001-4000-8000-000000000001":"A","a1b2c3d4-0001-4000-8000-000000000007":"R","a1b2c3d4-0001-4000-8000-000000000002":"C"}'::jsonb
  );
