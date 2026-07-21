-- 20260721120000: El plan preventivo pasa a tener UNA sola tarea por tipo de
-- unidad: "Service", con la frecuencia del service completo.
--
-- Antes había una tarea por ítem (aceite, cada filtro, engrase, frenos, correas,
-- refrigerante…), cada una con su propio vencimiento. Pero el service no se hace
-- por partes: se hace entero de una vez. Diez contadores en paralelo para un
-- único evento sólo ensuciaban el tablero, y el detalle de qué se cambió se
-- escribe mejor a mano en cada OT (tareas libres / observaciones) que tildando
-- una lista fija.
--
-- Frecuencias, iguales a las que ya usaba el Service General del tablero
-- (lib/vehiculos/service-general.ts, defaultsPorTipo):
--   camión        20.000 km
--   camioneta     10.000 km
--   autoelevador     250 hs
-- Puro kilometraje/horas: sin plazo en meses, que disparaba el aviso antes de
-- tiempo en las unidades que andan poco.
--
-- Las tareas viejas se DESACTIVAN, no se borran: `activo=false` las saca del
-- checklist y del plan, pero conserva mantenimiento_realizado_tareas (el
-- historial de lo ya registrado) y volver a activar cualquiera es un tilde en el
-- tab Plantillas.
--
-- Nota: el puente OT → Neumáticos/Alineaciones (sincronizarNeumaticosDesdeOt)
-- matchea por TEXTO sobre tareas + observaciones, así que sigue funcionando:
-- escribir "rotación" en observaciones crea la rotación igual que antes.

begin;

update mantenimiento_plan_tareas
   set activo = false, updated_at = now()
 where tipo_vehiculo in ('camion', 'camioneta', 'autoelevador');

insert into mantenimiento_plan_tareas
  (codigo, nombre, categoria, tipo_vehiculo, frecuencia_km, frecuencia_meses, frecuencia_horas, orden, activo)
values
  ('service', 'Service', 'general', 'camion',       20000, null, null, 10, true),
  ('service', 'Service', 'general', 'camioneta',    10000, null, null, 10, true),
  ('service', 'Service', 'general', 'autoelevador',  null, null,  250, 10, true)
on conflict (codigo, tipo_vehiculo) do update
  set nombre           = excluded.nombre,
      frecuencia_km    = excluded.frecuencia_km,
      frecuencia_meses = excluded.frecuencia_meses,
      frecuencia_horas = excluded.frecuencia_horas,
      activo           = true,
      orden            = excluded.orden,
      updated_at       = now();

commit;
