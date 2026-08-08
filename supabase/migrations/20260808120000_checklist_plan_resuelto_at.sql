-- Trazabilidad del tiempo de respuesta de los focos del checklist.
--
-- El chofer carga el checklist (checklist_vehiculos.hora = T0) y el ítem
-- observado queda en checklist_respuestas. Mantenimiento carga el plan de
-- acción y, cuando lo cierra (estado = 'resuelto'), acá se sella T1 en
-- resuelto_at. El tiempo de respuesta = resuelto_at − hora del checklist.
--
-- resuelto_at NO se toca a mano: lo escribe el trigger. Si el plan vuelve a
-- pendiente / en_proceso se borra el sello, de modo que el reloj vuelve a
-- correr desde la carga original del checklist (no se premia reabrir).

alter table checklist_planes_accion
  add column if not exists resuelto_at timestamptz;

comment on column checklist_planes_accion.resuelto_at is
  'Momento en que el plan pasó a resuelto (lo sella el trigger, no la app). NULL = sigue abierto.';

create or replace function set_checklist_plan_resuelto_at()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'resuelto' then
    -- Al cerrarlo se sella una sola vez: editar la descripción o la foto
    -- después no debe mover el tiempo de respuesta ya medido.
    if tg_op = 'INSERT' or old.estado is distinct from 'resuelto' or old.resuelto_at is null then
      new.resuelto_at := coalesce(old.resuelto_at, now());
    else
      new.resuelto_at := old.resuelto_at;
    end if;
  else
    new.resuelto_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checklist_plan_resuelto_at on checklist_planes_accion;
create trigger trg_checklist_plan_resuelto_at
  before insert or update on checklist_planes_accion
  for each row execute function set_checklist_plan_resuelto_at();

-- Backfill de los planes ya cerrados: se usa updated_at como mejor
-- aproximación disponible (es la última vez que se tocó el plan). Los planes
-- nuevos ya quedan sellados con el momento real.
update checklist_planes_accion
   set resuelto_at = updated_at
 where estado = 'resuelto'
   and resuelto_at is null;
