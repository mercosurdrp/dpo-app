-- Ocupación de Bodega: sumar el PESO de la carga de GESCOM ("Gestión") al viaje.
--
-- Continuación de 20260810120000_ob_ceq_gescom.sql, que partió CEq / bultos / HL
-- en `*_chess` + `*_gescom` con totales GENERADOS... y se olvidó del peso:
-- `peso_total` siguió siendo una columna normal que escribe SOLO el sync de
-- Chess. Resultado en Pampeana (medido sobre los últimos 30 días al 14/09/2026):
-- los 12.968 bultos de Gestión imputados a viajes — el 17,2% de la carga —
-- pesaban 0 kg, con ~277 toneladas sin contar contra 766 t contabilizadas. La
-- columna "Peso (kg)" del detalle de la matinal mostraba camiones livianísimos,
-- y los 14 viajes 100% Gestión directamente en NULL. El SLA "Peso límite de
-- camiones" (8.500 kg netos) venía midiendo contra un peso incompleto.
--
-- Mismo modelo que el CEq: partes explícitas por origen y TOTAL GENERADO, sin
-- read-modify-write ni riesgo de pisadas entre crons. Así, todo lo que ya lee
-- `peso_total` (el diálogo de detalle, `ocupacion-bodega-resumen-dia.ts` y el
-- SLA de peso) se arregla solo, sin tocar una línea.
--
-- Idempotente (el DO solo convierte si `peso_total` todavía es columna normal).
-- En Misiones no hay GESCOM: `peso_gescom` queda en 0 y nada cambia.

alter table public.ocupacion_bodega_diaria
  add column if not exists peso_chess  numeric(12, 2) not null default 0,
  add column if not exists peso_gescom numeric(12, 2) not null default 0;

do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.ocupacion_bodega_diaria'::regclass
      and attname = 'peso_total'
      and attgenerated = ''          -- todavía es columna normal: convertir
  ) then
    -- Todo lo acumulado hasta hoy vino de Chess (NULL = viaje 100% Gestión).
    update public.ocupacion_bodega_diaria
      set peso_chess = coalesce(peso_total, 0);

    alter table public.ocupacion_bodega_diaria drop column peso_total;

    alter table public.ocupacion_bodega_diaria
      add column peso_total numeric(12, 2)
        generated always as (peso_chess + peso_gescom) stored;
  end if;
end $$;
