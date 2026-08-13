-- =============================================================================
-- RUTAS DE REPARTO + TARGET DE CEq POR CAMIÓN
-- Pedido de la reunión de logística (19/05): "buscar un target de camión por
-- ruta para poder analizar los valores diarios". El target global de 525 CEq
-- (ob_pct_target, mig 093) trata igual a un camión de Pergamino que a uno de
-- San Nicolás; acá cada ruta define su propio target y la app deriva la ruta
-- del día de cada camión desde ocupacion_bodega_localidad_diaria (localidad
-- dominante por CEq). El mapeo localidad→ruta es editable desde
-- /indicadores/target-rutas; el seed cubre las localidades vistas hasta hoy.
-- Solo Pampeana (Misiones no tiene ocupación de bodega por localidad).
-- =============================================================================

create table if not exists public.rutas_reparto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Localidades de ventas_diarias/OB que pertenecen a la ruta (en mayúsculas,
  -- tal como llegan de Chess). Una localidad vive en UNA sola ruta; la app
  -- lo garantiza al editar.
  localidades text[] not null default '{}',
  -- Target de CEq por camión-día para la ruta. NULL = sin definir (la app
  -- sugiere el p80 histórico).
  target_ceq numeric(8, 2),
  orden smallint not null default 0,
  activo boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rutas_reparto enable row level security;

-- Lectura para cualquier usuario logueado; escritura solo vía service role
-- (server actions con requireRole admin/supervisor).
drop policy if exists "rutas_reparto_select" on public.rutas_reparto;
create policy "rutas_reparto_select"
  on public.rutas_reparto for select
  to authenticated
  using (true);

-- Seed: mismas 5 zonas que dim_zonas_reparto, con las localidades históricas
-- de ocupacion_bodega_localidad_diaria asignadas por partido/recorrido.
insert into public.rutas_reparto (nombre, localidades, orden) values
  ('Pergamino', array['PERGAMINO','GUERRICO','MARIANO H ALFONZO','LA VIOLETA','EL ARBOLITO','CARABELAS'], 1),
  ('Ramallo / Villa Ramallo', array['RAMALLO','VILLA RAMALLO','PEREZ MILLAN','VILLA GRAL SAVIO EX SANCHEZ'], 2),
  ('Colón', array['COLON'], 3),
  ('Arrecifes', array['ARRECIFES','TODD'], 4),
  ('San Nicolás', array['SAN NICOLAS DE LOS ARROYOS','LA EMILIA','GENERAL ROJO','CAMPO SALLES','EREZCANO','GENERAL CONESA'], 5)
on conflict (nombre) do nothing;
