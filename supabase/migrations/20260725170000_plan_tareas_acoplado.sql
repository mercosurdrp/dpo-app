-- El plan preventivo admite ACOPLADOS.
--
-- `catalogo_vehiculos.tipo` y el tipo TS `VehiculoTipo` ya incluían 'acoplado'
-- (el acoplado AF516JB tiene sus 10 cubiertas cargadas en el módulo de
-- neumáticos), pero el check de mantenimiento_plan_tareas se había quedado con
-- los cuatro tipos originales, así que no se le podían dar tareas de plan.

alter table mantenimiento_plan_tareas
  drop constraint if exists mantenimiento_plan_tareas_tipo_vehiculo_check;

alter table mantenimiento_plan_tareas
  add constraint mantenimiento_plan_tareas_tipo_vehiculo_check
  check (tipo_vehiculo in ('camion', 'camioneta', 'autoelevador', 'utilitario', 'acoplado'));
