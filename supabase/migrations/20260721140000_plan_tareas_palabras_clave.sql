-- 20260721140000: Detección de tareas del plan por TEXTO de la OT.
--
-- El taller no tilda checkboxes: escribe lo que hizo ("se cambió la bomba de
-- agua a tantos km"). Hasta ahora eso quedaba como texto muerto y el contador
-- del próximo vencimiento no arrancaba nunca.
--
-- Ahora cada tarea del plan lleva sus palabras clave: si una OT COMPLETADA las
-- menciona en tareas libres u observaciones, la tarea queda registrada como
-- hecha al km/horas de esa OT, y de ahí en adelante cuenta. Es el mismo criterio
-- que ya usaba el puente OT → Neumáticos ("rotación" / "alineación"),
-- generalizado y con las palabras editables desde el tab Plantillas.
--
-- Las palabras se guardan NORMALIZADAS (minúsculas, sin acentos) porque el
-- matcheo normaliza el texto de la OT antes de comparar. La detección descarta
-- las frases negadas ("no se cambió", "queda pendiente") para no registrar un
-- mantenimiento que no ocurrió, que es peor que no detectar nada.

alter table mantenimiento_plan_tareas
  add column if not exists palabras_clave text[] not null default '{}';

comment on column mantenimiento_plan_tareas.palabras_clave is
  'Términos que, si aparecen en las tareas libres u observaciones de una OT completada, registran esta tarea como realizada. En minúsculas y sin acentos.';

-- `auto` distingue las filas puestas por la detección de las que el usuario
-- tildó a mano: la resincronización sólo reemplaza las automáticas, así un
-- tilde manual nunca se pisa ni se borra solo.
alter table mantenimiento_realizado_tareas
  add column if not exists auto boolean not null default false;

comment on column mantenimiento_realizado_tareas.auto is
  'true = la detectó el texto de la OT, no la tildó el usuario.';

update mantenimiento_plan_tareas
   set palabras_clave = '{service,servis,servicio}'
 where codigo = 'service';

update mantenimiento_plan_tareas
   set palabras_clave = '{valvula,"bomba de agua",correa,distribucion}'
 where codigo = 'valvulas_bomba_correa';

update mantenimiento_plan_tareas
   set palabras_clave = '{"aceite de caja","aceite caja"}'
 where codigo = 'aceite_caja';

update mantenimiento_plan_tareas
   set palabras_clave = '{"aceite diferencial","aceite de diferencial",diferencial}'
 where codigo = 'aceite_diferencial';
