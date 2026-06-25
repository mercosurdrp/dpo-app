-- =============================================
-- Radar de Rechazos del Día Siguiente
-- =============================================
-- Foto diaria (cron ~09:30 AR, post-ruteo) de los clientes que se van a
-- entregar MAÑANA y que tienen historial de rechazo por CERRADO (id_rechazo 1)
-- o SIN DINERO (id_rechazo 6). Ventas la trabaja en su matinal para avisar al
-- cliente y evitar el rechazo del día siguiente.
--
-- Cuelga del nodo OTIF → IN-FULL → Rechazo → {Cerrado, Sin Dinero} del Árbol
-- del Sueño. Solo Pampeana.
--
-- Dos tablas:
--   radar_rechazos_snapshot  → 1 fila por fecha de entrega (cabecera + totales)
--   radar_rechazos_cliente   → 1 fila por cliente en riesgo dentro de esa foto
--
-- El cron escribe con service-role (bypassa RLS). La app solo lee.
-- =============================================

begin;

-- ─── Cabecera: una foto por fecha de entrega ─────────────────────────────────
create table if not exists radar_rechazos_snapshot (
  id                     uuid primary key default gen_random_uuid(),
  fecha_entrega          date not null unique,        -- día de entrega (mañana al generar)
  generado_at            timestamptz not null default now(),
  total_clientes_dia     int     not null default 0,  -- clientes con pedido ruteado ese día
  total_clientes_riesgo  int     not null default 0,  -- de esos, cuántos con historial cerrado/sin dinero
  total_bultos_riesgo    numeric not null default 0,  -- Σ bultos de los pedidos en riesgo
  total_monto_riesgo     numeric not null default 0,  -- Σ monto de los pedidos en riesgo
  nota                   text
);

create index if not exists idx_radar_snapshot_fecha
  on radar_rechazos_snapshot(fecha_entrega desc);

-- ─── Detalle: un cliente en riesgo dentro de una foto ────────────────────────
create table if not exists radar_rechazos_cliente (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid not null references radar_rechazos_snapshot(id) on delete cascade,
  fecha_entrega   date not null,
  id_cliente      int,
  nombre_cliente  text,
  localidad       text,
  telefono        text,
  id_promotor     text,
  nombre_promotor text,
  reparto         text,                                -- patente / transporte asignado (Chess Reparto)
  bultos_pedido   numeric not null default 0,          -- bultos del pedido de mañana (lo en juego)
  monto_pedido    numeric not null default 0,
  cerrado_anio    int not null default 0,              -- rechazos CERRADO últimos 365 días
  cerrado_mes     int not null default 0,              -- rechazos CERRADO últimos 30 días
  sin_dinero_anio int not null default 0,              -- rechazos SIN DINERO últimos 365 días
  sin_dinero_mes  int not null default 0,              -- rechazos SIN DINERO últimos 30 días
  riesgo_total    int not null default 0,              -- cerrado_anio + sin_dinero_anio (orden)
  created_at      timestamptz not null default now()
);

create index if not exists idx_radar_cliente_snapshot
  on radar_rechazos_cliente(snapshot_id);
create index if not exists idx_radar_cliente_promotor
  on radar_rechazos_cliente(snapshot_id, id_promotor);

-- ─── RLS: lectura para cualquier autenticado, escritura solo admin ───────────
alter table radar_rechazos_snapshot enable row level security;
alter table radar_rechazos_cliente  enable row level security;

drop policy if exists "radar_snapshot_select_auth" on radar_rechazos_snapshot;
create policy "radar_snapshot_select_auth"
  on radar_rechazos_snapshot for select to authenticated using (true);

drop policy if exists "radar_snapshot_write_admin" on radar_rechazos_snapshot;
create policy "radar_snapshot_write_admin"
  on radar_rechazos_snapshot for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "radar_cliente_select_auth" on radar_rechazos_cliente;
create policy "radar_cliente_select_auth"
  on radar_rechazos_cliente for select to authenticated using (true);

drop policy if exists "radar_cliente_write_admin" on radar_rechazos_cliente;
create policy "radar_cliente_write_admin"
  on radar_rechazos_cliente for all to authenticated
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

commit;
