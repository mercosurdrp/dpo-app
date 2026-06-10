-- 110_ventas_diarias_sku.sql
-- Detalle de ventas por SKU/día/origen para los drill-downs del tablero de reuniones
-- ("Bultos vendidos" → Chess vs Gestión → SKUs). Poblada por los dos syncs:
--   - Chess:   src/lib/sync/rechazos-sync.ts (ventas FCVTA del día)
--   - Gestión: src/lib/sync/gescom-rechazos-sync.ts (comprobantes VEN empresa 98)
-- Idempotente; inocua en Misiones (queda vacía hasta que el sync escriba).

create table if not exists public.ventas_diarias_sku (
  id bigint generated always as identity primary key,
  fecha date not null,
  origen text not null default 'chess',
  id_articulo integer not null,
  ds_articulo text not null,
  bultos numeric not null default 0,
  hl numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint ventas_diarias_sku_origen_chk check (origen in ('chess', 'gestion')),
  constraint ventas_diarias_sku_fecha_origen_articulo_key unique (fecha, origen, id_articulo)
);

create index if not exists idx_ventas_diarias_sku_fecha on public.ventas_diarias_sku (fecha);

alter table public.ventas_diarias_sku enable row level security;

drop policy if exists "ventas_diarias_sku_select_authenticated" on public.ventas_diarias_sku;
create policy "ventas_diarias_sku_select_authenticated"
  on public.ventas_diarias_sku for select to authenticated using (true);

drop policy if exists "ventas_diarias_sku_all_service_role" on public.ventas_diarias_sku;
create policy "ventas_diarias_sku_all_service_role"
  on public.ventas_diarias_sku for all to service_role using (true) with check (true);
