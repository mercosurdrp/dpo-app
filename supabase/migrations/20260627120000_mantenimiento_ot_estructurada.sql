-- Campos estructurados de Orden de Trabajo (OT) en mantenimiento.
-- Hasta ahora "qué se hizo / repuestos / mano de obra" vivía como texto libre en
-- mantenimiento_realizados.observaciones. Esto lo lleva a campos:
--   * numero_ot        -> nº de orden de trabajo propio (distinto de la factura)
--   * horas_mano_obra  -> horas de mano de obra de la OT
--   * costo_mano_obra  -> costo de esa mano de obra
--   * mantenimiento_realizado_repuestos -> repuestos como lista (item por item)
-- El "trabajo realizado" sigue en mantenimiento_realizado_tareas; el costo total
-- (mantenimiento_realizados.costo) se mantiene editable y la UI lo sugiere como
-- Σ repuestos + mano de obra + tareas.
--
-- Módulo de mantenimiento = solo Pampeana, pero el esquema se aplica a ambos
-- tenants para mantenerlos en sync (igual que checklist_planes_accion).

alter table mantenimiento_realizados
  add column if not exists numero_ot       text,
  add column if not exists horas_mano_obra numeric(10, 2) check (horas_mano_obra >= 0),
  add column if not exists costo_mano_obra numeric(12, 2) check (costo_mano_obra >= 0);

create table if not exists mantenimiento_realizado_repuestos (
  id               uuid primary key default gen_random_uuid(),
  mantenimiento_id uuid not null references mantenimiento_realizados(id) on delete cascade,
  descripcion      text not null,
  cantidad         numeric(12, 2) not null default 1 check (cantidad > 0),
  costo_unitario   numeric(12, 2) check (costo_unitario >= 0),
  created_at       timestamptz not null default now()
);

create index if not exists mantenimiento_realizado_repuestos_mant_idx
  on mantenimiento_realizado_repuestos (mantenimiento_id);

alter table mantenimiento_realizado_repuestos enable row level security;

-- Lectura: cualquier usuario autenticado (igual que mantenimiento_realizados).
create policy mantenimiento_realizado_repuestos_read on mantenimiento_realizado_repuestos
  for select using (true);

-- Escritura: solo admin / supervisor.
create policy mantenimiento_realizado_repuestos_write on mantenimiento_realizado_repuestos
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
