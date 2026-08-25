-- Corrección de odómetros mal cargados (revisado el 25/08/2026)
--
-- QUÉ CAMBIA SI LO CORRÉS: nada de lo que se calcula hoy. Es prolijidad del
-- registro histórico, no un arreglo urgente.
--
-- Por qué bajó de prioridad: hasta el 25/08 estos tres números SÍ rompían el
-- cronograma, porque `kmActualRobustoPorDominio` aceptaba una lectura menor a la
-- última aceptada como nueva referencia y a partir de ahí descartaba todas las
-- buenas. Eso ya está arreglado en el código (commit 1311d495): un retroceso se
-- descarta. Verificado lectura por lectura, los tres quedan afuera solos:
--
--   AE908DH  20/07 → 79.820 no, ya venía de 80.068 el 18/07     (era el RE)
--   AE908DH  19/08 → 131.940 descartado vs 142.790 del 18/08
--   AE908DH  23/08 → 133.097 descartado vs 143.098 del 22/08
--   AF588SU  03/08 → 117.922 descartado vs 119.027 del mismo día
--
-- Y tampoco anclan vencimientos: las dos OT son `correctivo`, con la tarea
-- suelta "Mantenimiento correctivo" sin vincular a ninguna tarea del plan, y
-- ninguna tiene `es_service_general`. El ancla del service del DH es la OT 1711
-- del 12/05 @ 127.179, que está bien.
--
-- Se corrige igual para que el legajo de la unidad no diga que el 19/08 el DH
-- marcaba 131.940 km cuando marcaba 142.790.

BEGIN;

-- ---------------------------------------------------------------------------
-- AE908DH · OT 1758 · 19/08/2026 · cargó 131.940 km
-- Ese día la unidad estaba entre 142.790 (retorno del 18/08) y 142.795 (egreso
-- del 20/08). Dedazo de ~10.850 km hacia abajo.
-- ---------------------------------------------------------------------------
UPDATE mantenimiento_realizados
   SET odometro = 142790, updated_at = now()
 WHERE id = 'a76d4fde-a9b6-4110-8c03-06f9f0ae59e3'
   AND dominio = 'AE908DH'
   AND numero_ot = '1758'
   AND odometro = 131940;   -- si ya fue corregida, no toca nada

-- ---------------------------------------------------------------------------
-- AF588SU · OT 1755 · 03/08/2026 · cargó 117.922 km
-- Ese día marcaba 119.008 (combustible) / 119.027 (egreso). El 117.922 es
-- exactamente la lectura del 17/07: se copió un número viejo.
-- ---------------------------------------------------------------------------
UPDATE mantenimiento_realizados
   SET odometro = 119027, updated_at = now()
 WHERE id = 'ce9de882-2679-4ed7-bd2f-ae120b9a7470'
   AND dominio = 'AF588SU'
   AND numero_ot = '1755'
   AND odometro = 117922;

-- ---------------------------------------------------------------------------
-- AE908DH · checklist de retorno del 23/08/2026 · cargó 133.097 km
-- El 4 tecleado como 3. Valor confirmado por Flota el 24/08: 143.097.
-- ---------------------------------------------------------------------------
UPDATE checklist_vehiculos
   SET odometro = 143097
 WHERE id = '056c502d-fe92-4deb-aade-b1fdf16d83c0'
   AND dominio = 'AE908DH'
   AND fecha = '2026-08-23'
   AND odometro = 133097;

COMMIT;

-- Control: tiene que dar 142790, 119027 y 143097.
SELECT numero_ot, dominio, fecha, odometro
  FROM mantenimiento_realizados
 WHERE id IN ('a76d4fde-a9b6-4110-8c03-06f9f0ae59e3',
              'ce9de882-2679-4ed7-bd2f-ae120b9a7470');
SELECT dominio, fecha, odometro
  FROM checklist_vehiculos
 WHERE id = '056c502d-fe92-4deb-aade-b1fdf16d83c0';


-- ===========================================================================
-- CERRADO — NO HACER NADA
--
--  · AF199RE · OT 1745 · 20/07/2026 · cargó 79.820 (la unidad estaba entre
--    80.068 y 80.817). Revisado el 25/08: es inofensivo. La lectura queda
--    descartada por retroceso, la OT no tiene ninguna tarea del plan vinculada
--    y no es el ancla del service (esa es la OT 1713 del 30/06 @ 79.500,
--    es_service_general). No corre ninguna fecha. La orden programada del
--    10/08 figura `realizada`.
--
--
-- ERRORES DE REGISTRO DE EGRESO / CHECKLIST — opcionales
--
-- No anclan nada y el filtro de retrocesos + el de saltos ya los descarta. Se
-- listan por si se quiere limpiar el historial:
--
--  · AF399KY · 06/07 07:20 egreso 104.906  → la liberación del mismo día dice
--    103.906. La OT 1735 de esa unidad está BIEN (104.433 es el retorno real).
--  · AF399KY · 17/07 07:24 egreso 95.409   → ese número es del AF028YB: se
--    cargó en la unidad equivocada.
--  · AE908DH · 10/08 liberación 151.568    → entre 141.567 y 141.635: es 141.568.
--  · AE908DH · 30/07 egreso 104.130        → el 27/07 marcaba 140.125: es 140.130.
--  · AE908DH · 08/08 egreso 120.213        → número del AE591EI, unidad equivocada.
--  · AF028YB · 03/07 44.636 / 01/08 46.536 / 18/08 47.607 / 19/08 47.700
--    → el 9 tecleado como 4: 94.636 / 96.536 / 97.607 / 97.700.
--  · AF588SU · 17/07 liberación 117        → quedó truncado (marcaba 117.9xx).
--  · AF588SU · 30/07 egreso 118.162 y checklist 118.672 → venía de 118.761 el
--    29/07. Los dos se descartan por retroceso.
-- ===========================================================================
