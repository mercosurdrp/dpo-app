-- Ocupación de Bodega: sumar la carga de GESCOM ("Gestión") al CEq del viaje.
--
-- `ceq_total` se calculaba SOLO con Chess — el mismo bug que tuvo el TLP (y que
-- ahí se arregló en junio 2026): ~30% de las CEq reales vienen de Gestión,
-- concentradas en los camiones que reparten esa carga, que por eso mostraban
-- ocupación bajísima (ej. "el DH").
--
-- Modelo: partes explícitas por origen y TOTALES GENERADOS. El sync de Chess
-- escribe `*_chess`, el de Gestión escribe `*_gescom`, y `ceq_total` /
-- `bultos_total` / `hl_total` / `ob_pct_target` se derivan solos — sin
-- read-modify-write ni riesgo de pisadas entre crons.
--
-- Idempotente (el DO solo convierte si `ceq_total` todavía es columna normal).
-- En Misiones no hay GESCOM: `*_gescom` queda en 0 y nada cambia.

alter table public.ocupacion_bodega_diaria
  add column if not exists ceq_chess    numeric(12, 2) not null default 0,
  add column if not exists ceq_gescom   numeric(12, 2) not null default 0,
  add column if not exists bultos_chess numeric(12, 2) not null default 0,
  add column if not exists bultos_gescom numeric(12, 2) not null default 0,
  add column if not exists hl_chess     numeric(12, 4) not null default 0,
  add column if not exists hl_gescom    numeric(12, 4) not null default 0;

do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.ocupacion_bodega_diaria'::regclass
      and attname = 'ceq_total'
      and attgenerated = ''          -- todavía es columna normal: convertir
  ) then
    -- Todo lo acumulado hasta hoy vino de Chess.
    update public.ocupacion_bodega_diaria
      set ceq_chess = ceq_total, bultos_chess = bultos_total, hl_chess = hl_total;

    alter table public.ocupacion_bodega_diaria drop column ob_pct_target;
    alter table public.ocupacion_bodega_diaria drop column ceq_total;
    alter table public.ocupacion_bodega_diaria drop column bultos_total;
    alter table public.ocupacion_bodega_diaria drop column hl_total;

    alter table public.ocupacion_bodega_diaria
      add column ceq_total numeric(12, 2) generated always as (ceq_chess + ceq_gescom) stored;
    alter table public.ocupacion_bodega_diaria
      add column bultos_total numeric(12, 2) generated always as (bultos_chess + bultos_gescom) stored;
    alter table public.ocupacion_bodega_diaria
      add column hl_total numeric(12, 4) generated always as (hl_chess + hl_gescom) stored;
    -- OB% relativo al target 525 CEq (migración 093), ahora sobre Chess + Gestión.
    alter table public.ocupacion_bodega_diaria
      add column ob_pct_target numeric(7, 2) generated always as (
        case when (ceq_chess + ceq_gescom) > 0
          then ((ceq_chess + ceq_gescom) / 525.0) * 100.0
          else 0
        end
      ) stored;
  end if;
end $$;
