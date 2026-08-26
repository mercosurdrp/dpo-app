-- Checklist de camión, categoría CARROCERÍA: una cosa por ítem (26/08/2026)
--
-- PROBLEMA: el ítem "Estado de manijas, barandas, estribos y soldaduras" pedía
-- UNA respuesta para cuatro elementos distintos. Con la baranda floja y el
-- estribo sano no hay forma de contestar: para que fuera NO OK tendrían que
-- estar mal los cuatro, y marcado OK no se sabe cuál se miró. En 1.000
-- respuestas nunca salió NO OK, mientras entre junio y agosto de 2026 se
-- hicieron cuatro OT correctivas de soldadura de carrocería (AF664NY 02/06 y
-- 24/08, AE908DH 14/07, AF588SU 10/08). El ítem no está mal cargado: no es
-- medible.
--
-- 🚨 El comentario por respuesta no salva la situación: de los 48 defectos
-- registrados en toda la historia del checklist, sólo 10 (21 %) traen texto.
-- Cuatro de cada cinco NO OK no dicen qué falló.
--
-- ADEMÁS los estribos estaban duplicados: aparecían dentro del ítem compuesto
-- y también en "Estribos en buen estado", así que la misma pieza podía quedar
-- OK en un renglón y NO OK en el otro sin que ninguno fuera mentira.
--
-- QUÉ SE HACE:
--   1. El ítem compuesto se DA DE BAJA (active = false), no se renombra. Sus
--      1.000 respuestas históricas conservan el nombre con el que se
--      preguntaron: renombrarlo haría que el historial dijera que se preguntó
--      algo que no se preguntó.
--   2. Entra "Estado de manijas y barandas" en su lugar.
--   3. Entra "Fisuras en soldaduras de parantes y caja", que es el defecto que
--      hoy no tiene dónde registrarse.
--   4. "Estribos en buen estado" sube al lado de los otros dos y queda como el
--      único renglón de estribos.
--   5. Los cuatro ítems que no cambian se recorren de orden.
--
-- Todos NO críticos: crítico frena la unidad, y una fisura de pintura saltada
-- no siempre justifica dejar un camión en el playón. Se endurece cuando haya
-- dos o tres meses de datos.
--
-- Con criterio escrito en los tres, que es lo que hace que un NO OK signifique
-- lo mismo para todos los que llenan el checklist.
--
-- Sólo afecta al checklist de camión: `tipo_vehiculo IS NULL`. El autoelevador
-- y la camioneta tienen su propia lista y no se tocan.

BEGIN;

-- 1) Baja del ítem compuesto (el historial queda con su nombre original)
UPDATE checklist_items
   SET active = false
 WHERE nombre = 'Estado de manijas, barandas, estribos y soldaduras'
   AND categoria = 'CARROCERÍA';

-- 2) Manijas y barandas, con criterio
INSERT INTO checklist_items (categoria, nombre, descripcion, critico, tipo_respuesta, orden, active, tipo_vehiculo, tipo_check)
SELECT 'CARROCERÍA',
       'Estado de manijas y barandas',
       'OK= Manijas y barandas completas y firmes. NO OK= Falta alguna, está floja, doblada o partida.',
       false, 'ok_nook', 1, true, NULL, NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM checklist_items
    WHERE nombre = 'Estado de manijas y barandas' AND categoria = 'CARROCERÍA'
 );

-- 3) Soldaduras de parantes y caja, con criterio
INSERT INTO checklist_items (categoria, nombre, descripcion, critico, tipo_respuesta, orden, active, tipo_vehiculo, tipo_check)
SELECT 'CARROCERÍA',
       'Fisuras en soldaduras de parantes y caja',
       'OK= Cordones de soldadura sanos. NO OK= Fisura visible o pintura saltada sobre la soldadura. Se mira de cerca, recorriendo la unidad.',
       false, 'ok_nook', 3, true, NULL, NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM checklist_items
    WHERE nombre = 'Fisuras en soldaduras de parantes y caja' AND categoria = 'CARROCERÍA'
 );

-- 4) Estribos: sube al lado de los otros dos y estrena criterio
UPDATE checklist_items
   SET orden = 2,
       descripcion = 'OK= Estribo firme y completo. NO OK= Flojo, fisurado, doblado o faltante.'
 WHERE nombre = 'Estribos en buen estado'
   AND categoria = 'CARROCERÍA'
   AND tipo_vehiculo IS NULL;

-- 5) El resto de la categoría corre de lugar (no cambia nada más de ellos)
UPDATE checklist_items SET orden = 4 WHERE categoria = 'CARROCERÍA' AND tipo_vehiculo IS NULL AND nombre = 'Estado de las 5S del camión';
UPDATE checklist_items SET orden = 5 WHERE categoria = 'CARROCERÍA' AND tipo_vehiculo IS NULL AND nombre = 'Cierre de lonas';
UPDATE checklist_items SET orden = 6 WHERE categoria = 'CARROCERÍA' AND tipo_vehiculo IS NULL AND nombre = 'Estado de lonas general';
UPDATE checklist_items SET orden = 7 WHERE categoria = 'CARROCERÍA' AND tipo_vehiculo IS NULL AND nombre = 'Estado de carrocería';
UPDATE checklist_items SET orden = 8 WHERE categoria = 'CARROCERÍA' AND tipo_vehiculo IS NULL AND nombre = 'Funcionamiento de bocina y alarma de retroceso';

COMMIT;

-- Control: tienen que salir 8 filas activas, en orden, una cosa por renglón.
-- SELECT orden, nombre, critico, descripcion
--   FROM checklist_items
--  WHERE categoria = 'CARROCERÍA' AND tipo_vehiculo IS NULL AND active
--  ORDER BY orden;
