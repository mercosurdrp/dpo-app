-- 20260704150000: Vínculo OT ↔ Neumáticos (una sola carga, sin doble trabajo).
--   Las rotaciones y alineaciones pueden nacer automáticamente de una Orden de
--   Trabajo completada (tareas de "rotación" / "alineación o balanceo"). El
--   ot_id vincula el registro con su OT: permite upsert idempotente (una
--   rotación/alineación por OT) y, si la OT se borra, el registro cae con ella.

alter table mantenimiento_rotaciones
  add column if not exists ot_id uuid references mantenimiento_realizados(id) on delete cascade;
create unique index if not exists mantenimiento_rotaciones_ot_idx
  on mantenimiento_rotaciones (ot_id) where ot_id is not null;

alter table mantenimiento_alineaciones
  add column if not exists ot_id uuid references mantenimiento_realizados(id) on delete cascade;
create unique index if not exists mantenimiento_alineaciones_ot_idx
  on mantenimiento_alineaciones (ot_id) where ot_id is not null;
