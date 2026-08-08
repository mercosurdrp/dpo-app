-- Corrección de 20260808120000_checklist_plan_resuelto_at.sql.
--
-- En aquella migración el trigger se crea ANTES del backfill, así que el
-- `update ... set resuelto_at = updated_at` disparó el propio trigger, que al
-- ver `old.resuelto_at` nulo forzaba now() e ignoraba el valor del update: los
-- planes cerrados hace meses quedaron fechados el día de la carga y el tiempo
-- de respuesta salía inflado.
--
-- Acá el trigger respeta un `resuelto_at` explícito (la app nunca manda esa
-- columna, así que sigue sin poder falsear el tiempo desde la pantalla) y se
-- restauran las fechas reales de cierre.
-- 🚨 En Misiones aplicar ESTA migración junto con la 20260808120000.

create or replace function set_checklist_plan_resuelto_at()
returns trigger
language plpgsql
as $fn$
begin
  if new.estado = 'resuelto' then
    if tg_op = 'INSERT' or old.estado is distinct from 'resuelto' then
      new.resuelto_at := coalesce(new.resuelto_at, now());
    else
      new.resuelto_at := coalesce(new.resuelto_at, old.resuelto_at, now());
    end if;
  else
    new.resuelto_at := null;
  end if;
  return new;
end;
$fn$;

-- Un sello legítimo cae junto a `updated_at`; los pisados por el backfill
-- quedaron muy por encima.
update checklist_planes_accion
   set resuelto_at = updated_at
 where estado = 'resuelto'
   and resuelto_at is not null
   and resuelto_at > updated_at + interval '1 hour';
