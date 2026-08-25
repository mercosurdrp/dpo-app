-- Km estampado en cada ronda de neumáticos, por unidad (revisar el 25/08/2026)
--
-- NO CAMBIA NADA: es una consulta, se puede correr tranquilo.
--
-- POR QUÉ: el desgaste por km divide los mm perdidos por los km rodados entre
-- dos rondas. Ese km sale de `mantenimiento_neumatico_mediciones.km`, que se
-- estampa al guardar la ronda desde las lecturas reales de la unidad. El filtro
-- de retrocesos que descarta los odómetros mal cargados recién quedó bien el
-- 25/08/2026 (commit 1311d495): lo que se estampó ANTES quedó guardado como
-- estaba y el arreglo del código no lo repara.
--
-- QUÉ MIRAR: la última columna. Si entre dos rondas da NEGATIVO o un número
-- absurdo, el km de esa ronda está mal y el desgaste de esa unidad no sirve
-- hasta corregirlo. Sin filas con problema, el denominador está sano y no hay
-- nada más que hacer.

SELECT dominio,
       fecha,
       cubiertas,
       km,
       km - LAG(km) OVER (PARTITION BY dominio ORDER BY fecha)
         AS km_desde_la_ronda_anterior
  FROM (
        SELECT n.dominio,
               m.fecha,
               COUNT(*)     AS cubiertas,
               MAX(m.km)    AS km
          FROM mantenimiento_neumatico_mediciones m
          JOIN mantenimiento_neumaticos n ON n.id = m.neumatico_id
         WHERE m.fecha >= '2026-07-01'   -- desde que hay mediciones de calibre
           AND n.dominio IS NOT NULL
         GROUP BY n.dominio, m.fecha
       ) rondas
 ORDER BY dominio, fecha;


-- Las rondas que entraron SIN km: esas cubiertas no tienen desgaste posible
-- hasta que se les estampe el odómetro del día.
SELECT n.dominio,
       m.fecha,
       COUNT(*) AS cubiertas_sin_km
  FROM mantenimiento_neumatico_mediciones m
  JOIN mantenimiento_neumaticos n ON n.id = m.neumatico_id
 WHERE m.fecha >= '2026-07-01'
   AND m.km IS NULL
 GROUP BY n.dominio, m.fecha
 ORDER BY m.fecha, n.dominio;
