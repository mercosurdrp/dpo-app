-- Vincular la regulación de válvulas al plan preventivo (25/08/2026)
--
-- PROBLEMA: la tarea del plan "Regulación de válvulas + bomba de agua + correa"
-- (cada 100.000 km, camión) figuraba como NUNCA HECHA en las 11 unidades, así
-- que el Tablero operativo no la contaba ni en "Tareas vencidas" ni en
-- "Próximas a vencer": sin una primera vez no hay desde cuándo contar.
--
-- Pero el trabajo SÍ se hizo. Estaba cargado como texto suelto —en las
-- observaciones de la OT, o como descripción libre sin tildar la tarea del
-- plan— y el plan sólo mira `mantenimiento_realizado_tareas.tarea_id`.
--
-- 🚨 NO se incluyen las OT que nombran "válvula" por otra cosa, que no
-- reinician el ciclo: AF469UR 1283 (cambio de válvulas en rectificación de
-- motor), AE591EI 1301 (guía y retén, rectificadora), OJA403 1335 (válvula de
-- retorno), OJA403 1353 (pérdida de aire), AE908DG 1464 (junta de tapa de
-- válvula) y TOYOTA3 1507 (autoelevador, no le aplica la tarea).

BEGIN;

-- --------------------------------------------------------------------------
-- A) Ya tienen la fila con su descripción: sólo les falta el vínculo.
-- --------------------------------------------------------------------------
UPDATE mantenimiento_realizado_tareas
   SET tarea_id = '5931b9cc-caa8-4e87-9ea1-8dcbb847a415'
 WHERE id IN (
   '733499b6-e57d-4c71-b5ea-75aeb42ecda0',  -- AE908DH OT1465 20/01/26 @ 108.179
   '30d3d725-b74b-45ea-a782-b157e36f2ffb',  -- AE591EI OT1475 25/02/26 @  98.255
   '83ee509a-15e9-4553-8b55-4c463cde80c5',  -- AF399KY OT1515 10/03/26 @  98.064
   '24c652b1-affc-4b8a-bc5d-bebc3e9beb2a'   -- OJA403  OT1516 10/03/26 @ 403.402
 )
   AND tarea_id IS NULL;   -- si ya se vinculó, no toca nada

-- --------------------------------------------------------------------------
-- B) Sólo figuran en las observaciones de la OT (vinieron de Cloudfleet como
--    texto libre): se les crea la fila de tarea.
-- --------------------------------------------------------------------------
-- Las dos últimas NO dicen "válvulas" en ningún lado: son el "Servis completo"
-- de Bettiolo, confirmado por Flota el 25/08/2026 como la vez que se las
-- regularon. La del AF028YB es del mismo día y el mismo taller que el service
-- del AE908DG (OT1446), donde la regulación sí quedó escrita.
INSERT INTO mantenimiento_realizado_tareas (mantenimiento_id, tarea_id, descripcion, auto)
SELECT v.mantenimiento_id::uuid,
       '5931b9cc-caa8-4e87-9ea1-8dcbb847a415'::uuid,
       'Regulación de válvulas + bomba de agua + correa',
       false
  FROM (VALUES
    ('d7b215b6-e250-449c-bee5-0cbffb78efeb'),  -- AE908DF OT1284 07/08/25 @  53.082
    ('54d9513d-1229-41db-9d1b-519996cd3db7'),  -- AC165AJ OT1337 06/09/25 @ 134.204
    ('3f4f2fd0-1c2e-48e2-8e6b-a9b3e4ef0382'),  -- AF469UR OT1354 13/10/25 @ 161.288
    ('b76f031d-ec72-4ff7-9069-99073fa697f7'),  -- AE908DG OT1446 02/01/26 @  91.327
    ('b12dda73-1c67-4fed-8965-7abd3b37af77'),  -- OJA403  OT1723 04/06/26 @ 417.850
    ('8ce6b43d-0699-451d-8730-9c7956a017c7'),  -- AF028YB OT1449 02/01/26 @  83.458
    ('c0bf6e05-c57d-439b-869b-22f176cd5c2a')   -- AF588SU OT1692 13/05/26 @ 113.527
  ) AS v(mantenimiento_id)
 WHERE NOT EXISTS (                            -- idempotente: no duplica
   SELECT 1 FROM mantenimiento_realizado_tareas t
    WHERE t.mantenimiento_id = v.mantenimiento_id::uuid
      AND t.tarea_id = '5931b9cc-caa8-4e87-9ea1-8dcbb847a415'::uuid
 );

COMMIT;

-- Control: 11 filas, una por unidad salvo OJA403 que tiene 2.
SELECT m.dominio, m.numero_ot, m.fecha, m.odometro,
       m.odometro + 100000 AS proxima_a_los_km
  FROM mantenimiento_realizado_tareas t
  JOIN mantenimiento_realizados m ON m.id = t.mantenimiento_id
 WHERE t.tarea_id = '5931b9cc-caa8-4e87-9ea1-8dcbb847a415'
 ORDER BY m.dominio, m.fecha;


-- ===========================================================================
-- QUEDA AFUERA A PROPÓSITO
--
--   · AF664NY — confirmado por Flota el 25/08/2026: a esta NO se le hizo. Es la
--     unidad más nueva (arrancó con 20.478 km en mayo/2025) y hoy marca 58.858,
--     así que todavía no le tocaba. Va a seguir en "sin datos" hasta que se le
--     haga y se cargue con la tarea tildada.
-- ===========================================================================
