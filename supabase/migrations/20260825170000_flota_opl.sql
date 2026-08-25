-- OPL de flota: lecciones de un punto por unidad, alcanzables por QR (25/08/2026)
--
-- QUÉ ES: una OPL (lección de un punto) es una hoja sola que explica UNA cosa
-- —cómo se controla el nivel de aceite, cómo se mide el dibujo, qué mira el
-- chofer en la lona—. Sirve si está donde se hace el trabajo y en el momento en
-- que se hace. Hasta hoy no existían en la app: el estándar vivía en un SOP de
-- 20 páginas que nadie abre parado al lado de la rueda.
--
-- CÓMO LLEGA A LA MANO: cada unidad lleva pegado su QR (lo imprime
-- /api/vehiculos/qr-pdf). Al escanearlo se abre la unidad en la app y ahí están
-- las OPL que le aplican por tipo. Alcanza a las tres familias que pidió la
-- operación: los camiones, las unidades de depósito (autoelevadores, zorras) y
-- las de Team Run.
--
-- ALCANCE POR TIPO, no por unidad: la OPL de "control de dibujo" es la misma
-- para los 11 camiones. `tipos` vacío = aplica a todas.

create table if not exists public.flota_opl (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  /** Tipos de unidad a los que aplica (catalogo_vehiculos.tipo). Vacío = todas. */
  tipos text[] not null default '{}',
  /** Punto del pilar Flota que la OPL evidencia (ej. "1.3"). */
  punto_dpo text,
  archivo_path text,
  archivo_url text,
  archivo_nombre text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_flota_opl_activo on public.flota_opl (activo, orden);

alter table public.flota_opl enable row level security;

-- Lectura para cualquier usuario autenticado: el que escanea el QR es el chofer
-- o el operario de depósito, no el supervisor.
drop policy if exists flota_opl_read on public.flota_opl;
create policy flota_opl_read on public.flota_opl
  for select to authenticated using (true);

drop policy if exists flota_opl_write on public.flota_opl;
create policy flota_opl_write on public.flota_opl
  for all to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and (p.role)::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and (p.role)::text = any (array['admin','supervisor'])));

comment on table public.flota_opl is
  'Lecciones de un punto de flota. Se alcanzan escaneando el QR de la unidad; el archivo vive en el bucket mantenimiento-evidencias bajo opl/.';
