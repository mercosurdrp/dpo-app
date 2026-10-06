-- Tiempo de respuesta de los focos del checklist: dejar de medir "cuándo se
-- tocó el plan en la app" y medir cuándo el defecto dejó de estar.
--
-- Hasta hoy `resuelto_at` de los planes viejos venía del backfill de
-- 20260808120000/130000, que usó `updated_at` como mejor aproximación: la última
-- vez que alguien tocó el plan. Mantenimiento carga y cierra los planes días o
-- semanas después del arreglo, así que el tiempo de respuesta salía inflado sin
-- que nada avisara. Medido en Pampeana el 06/10/2026 sobre los 56 focos
-- cerrados: mediana de 285,7 h (casi 12 días) y 45 de 56 fuera de meta, cuando
-- los mismos defectos ya aparecían resueltos en el checklist del día siguiente.
--
-- Criterio del cierre real: el PRIMER checklist posterior de la misma unidad en
-- que ese mismo ítem volvió a dar OK. Es la única prueba que existe de que el
-- defecto se fue, y la carga el chofer, no quien cierra el plan.
--
-- Resultado: mediana 24,1 h (16,9 h los no críticos; 96,1 h los críticos, que
-- arrastran la pérdida de fluidos del HELI1 de tres semanas de julio) y 23 de 56
-- fuera de meta. En 12 casos el tiempo SUBIÓ: el plan se había cerrado mientras
-- el defecto seguía apareciendo en los checklists siguientes.
--
-- 🚨 Ya aplicado en Pampeana el 06/10/2026 (56 planes). Queda acá como registro y
-- para Misiones. Es idempotente: vuelve a dejar lo mismo si se corre de nuevo.

update checklist_planes_accion p
   set resuelto_at = ok.hora
  from checklist_respuestas r
  join checklist_vehiculos c on c.id = r.checklist_id
  cross join lateral (
    select cv.hora
      from checklist_respuestas rr
      join checklist_vehiculos cv on cv.id = rr.checklist_id
     where cv.dominio = c.dominio
       and rr.item_id = r.item_id
       and cv.hora > c.hora
       and rr.valor in ('ok', 'bueno')
     order by cv.hora
     limit 1
  ) ok
 where p.respuesta_id = r.id
   and p.estado = 'resuelto'
   and r.valor in ('nook', 'malo', 'regular')
   and p.resuelto_at is distinct from ok.hora;
