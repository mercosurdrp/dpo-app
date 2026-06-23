-- TLP (Transport Labor Productivity) — soporte para segregar por ciudad.
-- 1) CEq entregadas por (patente, fecha, LOCALIDAD): la tabla ocupacion_bodega_diaria
--    agrega por patente/fecha y pierde la localidad; esta guarda el desglose.
-- 2) Mapeo localidad (Chess) -> ciudad (zona de reparto), editable sin re-sync.

create table if not exists ocupacion_bodega_localidad_diaria (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  patente      text not null,
  localidad    text not null,
  ceq_total    numeric not null default 0,
  bultos_total numeric not null default 0,
  hl_total     numeric not null default 0,
  lineas       integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (fecha, patente, localidad)
);
create index if not exists idx_ob_loc_fecha on ocupacion_bodega_localidad_diaria (fecha);
create index if not exists idx_ob_loc_pat_fecha on ocupacion_bodega_localidad_diaria (patente, fecha);

-- Mapeo localidad -> ciudad. La localidad se guarda normalizada (UPPER + trim).
create table if not exists dim_localidad_ciudad (
  localidad text primary key,
  ciudad    text not null,
  updated_at timestamptz not null default now()
);

-- Seed inicial: localidades vistas en Chess agrupadas por ciudad cabecera.
insert into dim_localidad_ciudad (localidad, ciudad) values
  ('SAN NICOLAS DE LOS ARROYOS', 'San Nicolás'),
  ('LA EMILIA',                  'San Nicolás'),
  ('GENERAL ROJO',               'San Nicolás'),
  ('CAMPO SALLES',               'San Nicolás'),
  ('EREZCANO',                   'San Nicolás'),
  ('GENERAL CONESA',             'San Nicolás'),
  ('PERGAMINO',                  'Pergamino'),
  ('LA VIOLETA',                 'Pergamino'),
  ('TODD',                       'Pergamino'),
  ('MARIANO H ALFONZO',          'Pergamino'),
  ('RAMALLO',                    'Ramallo'),
  ('VILLA RAMALLO',              'Ramallo'),
  ('PEREZ MILLAN',               'Ramallo'),
  ('VILLA GRAL SAVIO EX SANCHEZ','Ramallo'),
  ('COLON',                      'Colón'),
  ('EL ARBOLITO',                'Colón'),
  ('ARRECIFES',                  'Arrecifes')
on conflict (localidad) do nothing;
