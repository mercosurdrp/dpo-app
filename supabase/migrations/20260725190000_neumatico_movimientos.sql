-- Movimientos de cubiertas: montaje, desmontaje y baja.
--
-- Hasta ahora el movimiento no quedaba registrado en ningún lado: montar y
-- desmontar solo actualizaba la fila de `mantenimiento_neumaticos`, así que al
-- desmontar una cubierta se perdía en qué unidad y posición había estado, y no
-- había con qué emitir un comprobante de la operación.
--
-- Cada fila es una foto del momento (unidad, posición, fecha, km/hs, medida,
-- código y factura), de la que sale el PDF del comprobante.

create table if not exists mantenimiento_neumatico_movimientos (
  id            uuid primary key default gen_random_uuid(),
  neumatico_id  uuid not null references mantenimiento_neumaticos(id) on delete cascade,
  tipo          text not null check (tipo in ('montaje', 'desmontaje', 'baja')),
  dominio       text,
  posicion      text,
  eje           text,
  fecha         date not null default current_date,
  /** Odómetro de la unidad (u horómetro en autoelevadores). */
  km            numeric(12, 2),
  medida        text,
  numero        text,
  factura_urls  text[],
  observaciones text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists mant_neu_mov_neumatico_idx
  on mantenimiento_neumatico_movimientos (neumatico_id, fecha desc);

create index if not exists mant_neu_mov_dominio_idx
  on mantenimiento_neumatico_movimientos (dominio, fecha desc);

alter table mantenimiento_neumatico_movimientos enable row level security;

drop policy if exists mant_neu_mov_read on mantenimiento_neumatico_movimientos;
create policy mant_neu_mov_read on mantenimiento_neumatico_movimientos
  for select using (true);

drop policy if exists mant_neu_mov_write on mantenimiento_neumatico_movimientos;
create policy mant_neu_mov_write on mantenimiento_neumatico_movimientos
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
