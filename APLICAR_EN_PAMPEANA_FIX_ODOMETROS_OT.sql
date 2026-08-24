-- Corrección de odómetros mal cargados en OT (24/08/2026)
--
-- POR QUÉ IMPORTA: `mantenimiento_realizados.odometro` es el ANCLA del plan
-- preventivo — de ahí sale "cuándo se hizo por última vez esta tarea" y, sumando
-- la frecuencia, el próximo vencimiento. A diferencia del km actual, esta
-- columna se lee SIN filtro de outliers: un dedazo acá corre todos los
-- vencimientos de esa unidad y ensucia service, adherencia y CIL.
--
-- Estas dos filas tienen evidencia cerrada: el número correcto sale del propio
-- checklist/egreso del mismo día. Verificar el SELECT de control antes y después.

BEGIN;

-- ---------------------------------------------------------------------------
-- AE908DH · OT 1758 · 19/08/2026 · cargó 131.940 km
-- Ese día la unidad estaba entre 142.790 (retorno del 18/08) y 142.795 (egreso
-- del 20/08). El 131.940 es un dedazo de ~10.850 km hacia abajo, y fue el que
-- dejó a la unidad clavada en 133.097 km en producción: como el km actual salía
-- del máximo de las lecturas aceptadas y una lectura menor pasaba a ser la
-- referencia, tiró abajo todas las lecturas buenas posteriores.
-- ---------------------------------------------------------------------------
UPDATE mantenimiento_realizados
   SET odometro = 142790, updated_at = now()
 WHERE id = 'a76d4fde-a9b6-4110-8c03-06f9f0ae59e3'
   AND dominio = 'AE908DH'
   AND numero_ot = '1758'
   AND odometro = 131940;   -- si ya fue corregida, no toca nada

-- ---------------------------------------------------------------------------
-- AF588SU · OT 1755 · 03/08/2026 · cargó 117.922 km
-- Ese día la unidad marcaba 119.008 (combustible) / 119.027 (egreso). El
-- 117.922 es exactamente la lectura del 17/07: se copió un número viejo.
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
-- Queda 1 km por debajo del egreso del 22/08 (143.098), así que el km actual de
-- la unidad sigue siendo 143.098 y esta lectura sigue sin computar — se corrige
-- para que el historial quede limpio, no porque cambie ningún cálculo.
-- ---------------------------------------------------------------------------
UPDATE checklist_vehiculos
   SET odometro = 143097
 WHERE id = '056c502d-fe92-4deb-aade-b1fdf16d83c0'
   AND dominio = 'AE908DH'
   AND fecha = '2026-08-23'
   AND odometro = 133097;

COMMIT;

-- Control: 142790, 119027 y 143097.
SELECT numero_ot, dominio, fecha, odometro
  FROM mantenimiento_realizados
 WHERE id IN ('a76d4fde-a9b6-4110-8c03-06f9f0ae59e3',
              'ce9de882-2679-4ed7-bd2f-ae120b9a7470');
SELECT dominio, fecha, odometro
  FROM checklist_vehiculos
 WHERE id = '056c502d-fe92-4deb-aade-b1fdf16d83c0';


-- ===========================================================================
-- PENDIENTE DE DEFINIR — NO SE TOCAN ACÁ
--
-- Estas tienen el número mal pero el valor correcto no se deduce de los datos.
-- Hay que ponerlo a mano desde Órdenes de Trabajo (el formulario ahora valida
-- la lectura, así que no deja volver a cargar un imposible):
--
--  · AF199RE · OT 1745 · 20/07/2026 · cargó 79.820 km
--    La unidad estaba entre 80.068 (18/07) y 80.817 (27/07). Faltan ~250 km,
--    pero no hay lectura del día que fije el número.
--
--
-- Y estas NO son errores de OT, son de registro de egreso (no anclan el plan
-- preventivo; el filtro de outliers ya las descarta). Se listan por si se
-- quieren limpiar:
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
-- ===========================================================================
