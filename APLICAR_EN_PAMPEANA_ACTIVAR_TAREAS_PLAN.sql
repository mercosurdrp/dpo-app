-- Activar tareas del plan preventivo que no controlaba nadie (25/08/2026)
--
-- Decidido con Flota el 25/08/2026, al revisar por qué el plan de camión tenía
-- 16 tareas y sólo 8 activas.
--
-- 🚨 Una tarea recién activada arranca en "sin datos" donde no haya historia:
-- sin una primera vez registrada no hay desde cuándo contar, y "sin datos" NO
-- alerta. Activar no llena el tablero de rojo. Se va llenando a medida que se
-- carguen las OT CON LA TAREA TILDADA — que es la parte que hay que sostener:
-- si el trabajo se escribe sólo en el texto libre de la OT, el plan no lo ve.
-- Es exactamente lo que había pasado con la regulación de válvulas.

BEGIN;

-- ==========================================================================
-- 1) Batería, alternador y luces — cada 6 meses
--    Las luces ya se miran en el checklist diario; lo que no tenía control
--    periódico es la batería y el alternador.
-- ==========================================================================
UPDATE mantenimiento_plan_tareas
   SET activo = true, updated_at = now()
 WHERE id IN (
   'aa6aa049-6774-4b9c-819e-7e9a146ff2cb',  -- camión    · Batería, alternador y luces
   'f326ddbc-096b-4ecd-9851-5581147de557'   -- camioneta · Batería y luces
 );

-- ==========================================================================
-- 2) Tren delantero + alineación y balanceo — cada 50.000 km
--    No lo controlaba ningún módulo, y es la causa típica del desgaste
--    desparejo que mide el tablero de Desgaste por km.
-- ==========================================================================
UPDATE mantenimiento_plan_tareas
   SET activo = true, updated_at = now()
 WHERE id = 'd9b7ef5c-5b72-438c-85d1-e999280f5049';

-- La tarea existía sólo para camión. Las camionetas también se alinean —al
-- AF199RE se le hizo el 20/07/2026 al ponerle las 4 cubiertas nuevas—, así que
-- se crea para camioneta.
-- Cada 10.000 km, el intervalo que usa Flota (confirmado el 25/08/2026). Es el
-- mismo que el service de camioneta: la alineación entra en cada service.
INSERT INTO mantenimiento_plan_tareas
       (codigo, nombre, categoria, tipo_vehiculo, frecuencia_km, frecuencia_meses, activo, orden)
-- categoria = 'general', la misma que usa la tarea en camión. La columna tiene
-- un CHECK y sólo acepta: motor, general, hidraulico, frenos, electrico,
-- neumaticos, documentacion.
SELECT 'tren_delantero', 'Tren delantero + alineación y balanceo', 'general',
       'camioneta', 10000, NULL, true, 25
 WHERE NOT EXISTS (
   SELECT 1 FROM mantenimiento_plan_tareas
    WHERE codigo = 'tren_delantero' AND tipo_vehiculo = 'camioneta'
 );

-- ==========================================================================
-- 3) Trazabilidad: cada vez que se colocaron cubiertas en el eje DELANTERO se
--    hizo la alineación (confirmado por Flota). Se enganchan esas OT a la
--    tarea para que arranque con historia real en vez de en "sin datos".
--
--    Salen de cruzar los montajes en posición 1I/1D de
--    `mantenimiento_neumatico_movimientos` con la OT de esa fecha, más las 2
--    alineaciones sueltas que ya estaban escritas en las observaciones.
-- ==========================================================================

-- 3.a) La única que ya tiene la fila cargada: sólo le falta el vínculo.
UPDATE mantenimiento_realizado_tareas
   SET tarea_id = 'd9b7ef5c-5b72-438c-85d1-e999280f5049'
 WHERE id = '92b3adc0-8460-4c57-97e2-728927b14f24'   -- AE591EI OT1753 03/08/26 @ 119.594
   AND tarea_id IS NULL;

-- 3.b) CAMIONES — se les crea la fila de tarea.
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, tarea_id, descripcion, auto)
SELECT v.mantenimiento_id::uuid,
       'd9b7ef5c-5b72-438c-85d1-e999280f5049'::uuid,
       'Tren delantero + alineación y balanceo',
       false
  FROM (VALUES
    ('715c6a8c-c58b-4c07-b659-43f245ab15de'),  -- OJA403  OT1279 04/08/25 @ 377.272  (alineación suelta)
    ('9dcd79d1-b387-4eea-a2f7-58b0870e7664'),  -- AE908DF OT1377 29/10/25 @  55.635  (alineación suelta)
    ('c8541e03-1ecd-45c6-ad00-486f6b3b6438'),  -- OJA403  OT1749 18/01/26 @ 391.740  (cubiertas 66 / 67)
    ('dcf44c2d-68b2-4764-842e-66a28cfa2cdc'),  -- AF588SU OT1751 10/03/26 @ 110.339  (cubiertas 68 / 69)
    ('56907224-e7d5-42e1-88ce-fd5a16ce3234'),  -- AF664NY OT1752 22/04/26 @  50.708  (cubiertas 72 / 73)
    ('a994f9c8-6af3-4500-aa54-d417f35657fa'),  -- AE908DH OT1750 06/05/26 @ 123.000  (cubiertas 70 / 71)
    ('247ae042-550a-46b6-b2cb-2c43baab3622')   -- AE908DF OT1744 27/07/26 @  74.897  (cubiertas 1 / 2)
  ) AS v(mantenimiento_id)
 WHERE NOT EXISTS (                            -- idempotente
   SELECT 1 FROM mantenimiento_realizado_tareas t
    WHERE t.mantenimiento_id = v.mantenimiento_id::uuid
      AND t.tarea_id = 'd9b7ef5c-5b72-438c-85d1-e999280f5049'::uuid
 );

-- 3.c) CAMIONETA — el AF199RE, contra la tarea de camioneta recién creada.
--      🚨 El odómetro de esa OT dice 79.820 y está mal: ese día la unidad
--      estaba entre 80.068 y 80.817. Con un ciclo de 10.000 km ese error de
--      ~500 km adelanta el vencimiento un 5%: la próxima queda a los 89.820 en
--      vez de ~90.400. Se usa igual porque adelanta, no atrasa.
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, tarea_id, descripcion, auto)
SELECT 'e953db17-5324-401d-bbe6-5a467068c7af'::uuid,   -- AF199RE OT1745 20/07/26 @ 79.820
       t.id, 'Tren delantero + alineación y balanceo', false
  FROM mantenimiento_plan_tareas t
 WHERE t.codigo = 'tren_delantero' AND t.tipo_vehiculo = 'camioneta'
   AND NOT EXISTS (
     SELECT 1 FROM mantenimiento_realizado_tareas x
      WHERE x.mantenimiento_id = 'e953db17-5324-401d-bbe6-5a467068c7af'::uuid
        AND x.tarea_id = t.id
   );

COMMIT;

-- Control 1: las cuatro tareas, todas en activo = true.
SELECT nombre, tipo_vehiculo, frecuencia_km, frecuencia_meses, activo
  FROM mantenimiento_plan_tareas
 WHERE codigo IN ('bateria_luces', 'tren_delantero')
 ORDER BY tipo_vehiculo, codigo;

-- Control 2: 9 alineaciones vinculadas (OJA403 y AE908DF tienen 2 cada uno).
SELECT m.dominio, m.numero_ot, m.fecha, m.odometro,
       m.odometro + t2.frecuencia_km AS proxima_a_los_km
  FROM mantenimiento_realizado_tareas t
  JOIN mantenimiento_realizados m   ON m.id  = t.mantenimiento_id
  JOIN mantenimiento_plan_tareas t2 ON t2.id = t.tarea_id
 WHERE t2.codigo = 'tren_delantero'
 ORDER BY m.dominio, m.fecha;


-- ===========================================================================
-- SIN ALINEACIÓN REGISTRADA — figuran "sin datos" hasta que se les haga
--
--   Camiones:   AC165AJ · AE908DG · AF028YB · AF399KY · AF469UR
--   Camioneta:  AF199RD
--
-- ===========================================================================
-- SE DEJAN INACTIVAS A PROPÓSITO
--
--  · Refrigerante: cambio de agua + limpieza de radiador — va dentro del
--    servis (decisión de Flota). Conviene tildarla igual en la OT del servis
--    para que quede el registro.
--  · Correas — ya está adentro de "Regulación de válvulas + bomba de agua +
--    correa", cada 100.000 km.
--  · Aceite de caja y diferencial — se cubre con "Cardán y fluidos".
--  · VTV y Matafuego — se controlan en Requisitos Legales: 14 VTV y 14
--    extintores de camiones cargados con su vencimiento.
--  · Neumáticos: rotación — la lleva el módulo de Neumáticos, con intervalo de
--    20.000 km. Activarla acá sumaría 13 celdas en "sin datos" sin arreglar
--    nada: `registrarRotacion` escribe en `mantenimiento_rotaciones` y el plan
--    no lee esa tabla. El arreglo es de código, no de configuración.
--  · Frenos: pastillas/discos (camioneta) — sin definir.
--  · Autoelevadores: Batería y luces, Aceite de transmisión — sin definir.
-- ===========================================================================
