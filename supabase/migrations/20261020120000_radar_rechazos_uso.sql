-- =============================================
-- Radar de Rechazos: registro de uso
-- =============================================
-- Fausto (20/10/2026): tres clientes rechazaron por SIN DINERO y dos de ellos
-- estaban en el radar de ese día. No había forma de saber si Ventas lo mira.
--
-- Una fila por cada vez que alguien ABRE la pantalla del radar o DESCARGA el
-- PDF de críticos: quién, qué foto (fecha de entrega) y a qué hora.
--
-- Guardamos nombre/email/rol tal como estaban al momento del evento para que
-- el registro se lea solo aunque después cambie el perfil.
--
-- La app escribe con service role (el helper nunca rompe la pantalla si falla).
-- Lectura: solo admin y supervisor. Solo Pampeana.
-- =============================================

begin;

create table if not exists radar_rechazos_uso (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete set null,
  nombre         text,
  email          text,
  role           text,
  accion         text not null check (accion in ('ABRIR', 'PDF')),
  fecha_entrega  date,                     -- foto que miró (null = no había foto)
  historica      boolean not null default false, -- eligió una foto anterior
  created_at     timestamptz not null default now()
);

create index if not exists idx_radar_uso_created
  on radar_rechazos_uso(created_at desc);
create index if not exists idx_radar_uso_user
  on radar_rechazos_uso(user_id, created_at desc);

alter table radar_rechazos_uso enable row level security;

drop policy if exists "radar_uso_select_admin_sup" on radar_rechazos_uso;
create policy "radar_uso_select_admin_sup"
  on radar_rechazos_uso for select to authenticated
  using (exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'supervisor')
  ));

commit;
