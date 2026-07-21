-- 20260721121000: Facturas de repuestos dentro de la Orden de Trabajo.
--
-- Hasta ahora la OT tenía UN solo proveedor (`taller`) y UNA sola factura
-- (`numero_factura`), pero en la práctica la mano de obra la hace un mecánico y
-- los repuestos se compran aparte, a veces a más de un proveedor. Esta tabla
-- permite N facturas de repuestos por OT, cada una con su proveedor, número,
-- monto y comprobante adjunto.
--
-- El monto de cada factura se resuelve así: si `monto_total` está cargado manda
-- ese valor y las líneas de repuesto quedan como detalle; si está vacío, se usa
-- la suma de sus líneas. Por eso `monto_total` es opcional.
--
-- `mantenimiento_realizados.taller` / `numero_factura` pasan a ser explícitamente
-- los de la MANO DE OBRA (no se migran: los 190 valores ya cargados son del
-- taller que hizo el trabajo, que es justamente la mano de obra).

begin;

create table if not exists mantenimiento_realizado_facturas (
  id               uuid primary key default gen_random_uuid(),
  mantenimiento_id uuid not null references mantenimiento_realizados(id) on delete cascade,
  proveedor        text,
  numero           text,
  monto_total      numeric(12, 2) check (monto_total >= 0),
  adjunto_url      text,
  orden            integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists mantenimiento_realizado_facturas_mant_idx
  on mantenimiento_realizado_facturas (mantenimiento_id, orden);

-- Cada línea de repuesto puede colgar de una factura. Nullable: los 92 repuestos
-- ya cargados quedan sin factura asociada y siguen sumando como hasta ahora.
alter table mantenimiento_realizado_repuestos
  add column if not exists factura_id uuid
    references mantenimiento_realizado_facturas(id) on delete set null;

create index if not exists mantenimiento_realizado_repuestos_factura_idx
  on mantenimiento_realizado_repuestos (factura_id);

alter table mantenimiento_realizado_facturas enable row level security;

-- Lectura: cualquier autenticado, igual que mantenimiento_realizados.
create policy mantenimiento_realizado_facturas_read on mantenimiento_realizado_facturas
  for select using (true);

-- Escritura: solo admin / supervisor. `(select auth.uid())` y no `auth.uid()`
-- para que el planner lo evalúe una vez (initplan) y no por fila.
create policy mantenimiento_realizado_facturas_write on mantenimiento_realizado_facturas
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = (select auth.uid())
        and p.role::text = any (array['admin', 'supervisor'])
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = (select auth.uid())
        and p.role::text = any (array['admin', 'supervisor'])
    )
  );

commit;
