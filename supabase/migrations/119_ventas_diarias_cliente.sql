-- 119: detalle de ventas por cliente × camión × día (unifica Chess y Gestión).
-- El sync de cada origen agrega por (fecha, fletero, cliente) en el mismo loop
-- que ya alimenta ventas_diarias / ventas_diarias_sku — mismo fetch, sin requests extra.
-- patente: en Chess = ds_fletero_carga; en Gestión se deriva del checklist del día
-- del chofer (fallback mapeo_chofer_gescom.patente_default); null si no se pudo.

create table if not exists ventas_diarias_cliente (
  id bigint generated always as identity primary key,
  fecha date not null,
  origen text not null check (origen in ('chess', 'gestion')),
  ds_fletero_carga text not null,
  patente text,
  id_cliente integer not null,
  nombre_cliente text,
  comprobantes integer not null default 0,
  bultos numeric not null default 0,
  hl numeric not null default 0,
  monto_neto numeric,
  updated_at timestamptz not null default now(),
  unique (fecha, origen, ds_fletero_carga, id_cliente)
);

create index if not exists idx_vdc_fecha on ventas_diarias_cliente (fecha);
create index if not exists idx_vdc_cliente on ventas_diarias_cliente (id_cliente, fecha);

alter table ventas_diarias_cliente enable row level security;

drop policy if exists "ventas_diarias_cliente_select" on ventas_diarias_cliente;
create policy "ventas_diarias_cliente_select"
  on ventas_diarias_cliente for select
  to authenticated
  using (true);

-- Escritura solo service_role (el sync); sin políticas de insert/update/delete.

-- Patente por defecto del chofer de Gestión (fallback cuando no hay checklist del día).
alter table mapeo_chofer_gescom add column if not exists patente_default text;
