-- Ausentismo del dimensionamiento (DPO 2.3/3.1): fracción 0–1 de la dotación que en
-- promedio no está disponible (vacaciones, licencias, faltas). Se aplica como
-- dotación efectiva = dotación × (1 − ausentismo) en resultados y proyección.
alter table public.dim_config
  add column if not exists ausentismo_almacen numeric not null default 0.08,
  add column if not exists ausentismo_reparto numeric not null default 0;

comment on column public.dim_config.ausentismo_almacen is
  'Fracción 0–1 de ausentismo de almacén; dotación efectiva = dotación × (1 − ausentismo)';
comment on column public.dim_config.ausentismo_reparto is
  'Fracción 0–1 de ausentismo de reparto; default 0 porque la dotación observada (registros_vehiculos) ya trae el ausentismo implícito — usar solo con plantel nominal cargado a mano';
