-- Registro de PEDIDOS FUERA DE RUTA (Pampeana).
-- Snapshot server-side del sheet "Novedades Logísticas 2025" (pestaña Novedades,
-- filas con NOVEDAD = 'FUERA DE RUTA'). La logística los carga a mano en el sheet;
-- la app los sincroniza al abrir la solapa "Fuera de ruta" de Priorización de Entrega
-- y acá quedan con historia (aunque en el sheet se borren o se archive el año).
--
-- Escritura: SOLO service_role (el sync usa createAdminClient). Sin policy de
-- insert/update para authenticated a propósito: la RLS es lo único que separa a
-- un usuario logueado de la API REST de Supabase.

create table if not exists public.fuera_ruta_registros (
  id bigint generated always as identity primary key,
  -- Identidad estable de la fila del sheet: fecha|nro_pedido|cod_cliente.
  -- Si en el sheet corrigen monto/dirección, el upsert actualiza la misma fila.
  clave text not null unique,
  fecha_entrega date not null,
  sucursal text,
  deposito text,
  cod_cliente integer,
  cliente text,
  comprobante text,
  nro_pedido text,
  tipo_comprobante text,
  monto numeric,
  localidad text,
  bultos numeric,
  descripcion text,
  cod_cliente_entregado integer,
  cliente_entregado text,
  direccion_entrega text,
  localidad_entrega text,
  observaciones text,
  patente text,
  canal text,
  -- Cuándo apareció por primera vez y cuándo se vio por última vez en el sheet.
  primera_vez timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index if not exists fuera_ruta_registros_fecha_idx
  on public.fuera_ruta_registros (fecha_entrega);

alter table public.fuera_ruta_registros enable row level security;

drop policy if exists fuera_ruta_registros_read on public.fuera_ruta_registros;
create policy fuera_ruta_registros_read
  on public.fuera_ruta_registros for select
  to authenticated
  using (true);
