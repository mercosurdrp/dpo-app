-- Origen de la orden de trabajo + idempotencia del sync de Cloudfleet.
-- Las OT pueden cargarse a mano (origen 'manual', como hasta ahora) o traerse
-- automáticamente desde Cloudfleet (origen 'cloudfleet'). `cloudfleet_number` es
-- el nº de OT en Cloudfleet y sirve de clave natural para el upsert del sync
-- (una OT de Cloudfleet por número). Las manuales lo dejan NULL.
--
-- Módulo de mantenimiento = solo Pampeana, pero el esquema se aplica a ambos
-- tenants para mantenerlos en sync (igual que el resto).

alter table mantenimiento_realizados
  add column if not exists origen text not null default 'manual'
    check (origen in ('manual', 'cloudfleet')),
  add column if not exists cloudfleet_number integer;

create unique index if not exists mantenimiento_realizados_cloudfleet_number_key
  on mantenimiento_realizados (cloudfleet_number)
  where cloudfleet_number is not null;
