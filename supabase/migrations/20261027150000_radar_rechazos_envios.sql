-- Radar de Rechazos: aviso por WhatsApp a los vendedores (07:00 ART).
--
-- Cada mañana el cron /api/radar-rechazos/cron-vendedores le manda a cada
-- vendedor sus clientes CRÍTICOS con entrega el próximo día de reparto, y a
-- cada supervisor el resumen de su equipo. Esta tabla registra cada envío:
--   * idempotencia: si el cron se re-ejecuta no le vuelve a escribir a quien
--     ya recibió OK la foto de esa fecha (unique fecha_entrega + phone);
--   * auditoría: quién recibió qué y cuántos clientes.
-- Solo la escribe el cron con service role; la leen admin y supervisor.

begin;

create table if not exists radar_rechazos_envios (
  id             uuid primary key default gen_random_uuid(),
  fecha_entrega  date not null,
  destinatario   text not null check (destinatario in ('vendedor', 'supervisor')),
  id_promotor    text,
  nombre         text,
  phone          text not null,
  clientes       integer not null default 0,
  ok             boolean not null default false,
  status         integer,
  error          text,
  created_at     timestamptz not null default now(),
  unique (fecha_entrega, phone)
);

create index if not exists idx_radar_envios_fecha
  on radar_rechazos_envios(fecha_entrega desc);

alter table radar_rechazos_envios enable row level security;

drop policy if exists "radar_envios_select_admin_sup" on radar_rechazos_envios;
create policy "radar_envios_select_admin_sup"
  on radar_rechazos_envios for select to authenticated
  using (exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  ));

commit;
