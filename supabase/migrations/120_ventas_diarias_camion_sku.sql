-- 120: detalle de ventas por camión × SKU × día (drill del modal "Camiones del día").
-- Mismo patrón que ventas_diarias_cliente (mig 119): lo alimentan ambos syncs en la
-- misma pasada del fetch existente.

create table if not exists ventas_diarias_camion_sku (
  id bigint generated always as identity primary key,
  fecha date not null,
  origen text not null check (origen in ('chess', 'gestion')),
  ds_fletero_carga text not null,
  id_articulo integer not null,
  ds_articulo text,
  bultos numeric not null default 0,
  hl numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (fecha, origen, ds_fletero_carga, id_articulo)
);

create index if not exists idx_vdcs_fecha on ventas_diarias_camion_sku (fecha);

alter table ventas_diarias_camion_sku enable row level security;

drop policy if exists "ventas_diarias_camion_sku_select" on ventas_diarias_camion_sku;
create policy "ventas_diarias_camion_sku_select"
  on ventas_diarias_camion_sku for select
  to authenticated
  using (true);
