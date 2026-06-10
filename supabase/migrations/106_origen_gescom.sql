-- 106_origen_gescom.sql
-- Unificación Chess + Gestión (GESCOM): agrega columna `origen` ('chess'|'gestion')
-- a `rechazos` y `ventas_diarias` para que los indicadores sumen ambos sistemas.
-- Idempotente. Default 'chess' → no altera datos existentes ni la operación Misiones.
-- El nuevo UNIQUE incluye `origen` para que las filas de Gestión no colisionen con Chess.
--
-- ADITIVA / sin ventana: NO borra los uniques viejos (los sigue usando el código viejo
-- durante el build/deploy); agrega los nuevos (que usa el código nuevo con onConflict por
-- `origen`). Ambos coexisten → se puede aplicar antes del push sin romper el sync Chess vivo.
-- El cleanup de los uniques viejos queda para una migración futura, ya estable.

-- ── rechazos ─────────────────────────────────────────────────────────────────
alter table public.rechazos
  add column if not exists origen text not null default 'chess';

alter table public.rechazos drop constraint if exists rechazos_origen_chk;
alter table public.rechazos
  add constraint rechazos_origen_chk check (origen in ('chess', 'gestion'));

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'rechazos_origen_serie_nrodoc_id_articulo_key'
  ) then
    alter table public.rechazos
      add constraint rechazos_origen_serie_nrodoc_id_articulo_key
      unique (origen, serie, nrodoc, id_articulo);
  end if;
end $$;

create index if not exists idx_rechazos_origen on public.rechazos (origen);

-- ── ventas_diarias (denominador HL por patente/reparto y día) ────────────────
alter table public.ventas_diarias
  add column if not exists origen text not null default 'chess';

alter table public.ventas_diarias drop constraint if exists ventas_diarias_origen_chk;
alter table public.ventas_diarias
  add constraint ventas_diarias_origen_chk check (origen in ('chess', 'gestion'));

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'ventas_diarias_fecha_ds_fletero_carga_origen_key'
  ) then
    alter table public.ventas_diarias
      add constraint ventas_diarias_fecha_ds_fletero_carga_origen_key
      unique (fecha, ds_fletero_carga, origen);
  end if;
end $$;

create index if not exists idx_ventas_diarias_origen on public.ventas_diarias (origen);

-- ── motivo genérico para rechazos de Gestión ────────────────────────────────
-- Los DEV-RE de GESCOM vienen sin `motivo` desagregado. Se les asigna este código
-- reservado para que el dashboard los categorice (id_rechazo=9000).
insert into public.catalogo_rechazos (id_rechazo, ds_rechazo, categoria, controlable, activo, notes)
values (9000, 'Sin motivo', 'POR_CLASIFICAR', false, true,
        'Rechazos del sistema Gestión/GESCOM (DEV-RE). GESCOM no trae motivo desagregado.')
on conflict (id_rechazo) do nothing;
