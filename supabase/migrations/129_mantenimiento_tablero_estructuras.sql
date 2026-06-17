-- 129: Estructuras para completar el Tablero operativo de mantenimiento al estilo
-- Cloudfleet. Tablas para los datos que hoy NO existían en dpo y que el equipo
-- va a cargar: novedades, inspección de llantas, stock de repuestos y órdenes de
-- compra. (Los documentos de vehículos/personal/proveedores se cargan en
-- requisitos_legales; las programaciones de mantenimiento salen del service
-- general; los checklists ya existen.)
--
-- RLS: lectura para autenticados; escritura para admin/supervisor.

-- ---------- Novedades de mantenimiento ----------
create table if not exists mantenimiento_novedades (
  id uuid primary key default gen_random_uuid(),
  dominio text not null,
  fecha date not null default current_date,
  descripcion text not null,
  origen text not null default 'manual',          -- manual | checklist | otro
  prioridad text not null default 'media',          -- baja | media | alta
  estado text not null default 'abierta',           -- abierta | en_proceso | resuelta
  checklist_id uuid references checklist_vehiculos(id) on delete set null,
  resuelta_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mant_novedades_estado on mantenimiento_novedades (estado, fecha desc);

-- ---------- Inspección de llantas ----------
create table if not exists mantenimiento_llantas (
  id uuid primary key default gen_random_uuid(),
  dominio text not null,
  fecha date not null default current_date,
  posicion text,                                    -- ej. DD, DI, TDI1...
  profundidad_mm numeric(4,1),
  presion_psi numeric(5,1),
  observaciones text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mant_llantas_dom_fecha on mantenimiento_llantas (dominio, fecha desc);

-- ---------- Stock de repuestos / existencias ----------
create table if not exists mantenimiento_repuestos (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nombre text not null,
  unidad text,                                      -- u | lt | kg
  stock_actual numeric(12,2) not null default 0,
  stock_min numeric(12,2) not null default 0,
  stock_max numeric(12,2),
  ubicacion text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Órdenes de compra ----------
create table if not exists mantenimiento_ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  numero text,
  proveedor text,
  descripcion text,
  monto numeric(14,2),
  fecha date not null default current_date,
  estado text not null default 'pendiente',         -- pendiente | comprada | anulada
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mant_oc_estado on mantenimiento_ordenes_compra (estado, fecha desc);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array[
    'mantenimiento_novedades','mantenimiento_llantas',
    'mantenimiento_repuestos','mantenimiento_ordenes_compra'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$,
                   t||'_read', t);
    execute format($f$create policy %I on %I for all to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid()
                     and p.role::text = any (array['admin','supervisor'])))
      with check (exists (select 1 from profiles p where p.id = auth.uid()
                          and p.role::text = any (array['admin','supervisor'])))$f$,
                   t||'_write', t);
  end loop;
end $$;
