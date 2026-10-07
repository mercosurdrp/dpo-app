-- Factura A-00003-00018230 de RC Reconstructora Constitución (23/09/2026).
-- Subtotal $1.212.727,30 + IVA 21% = $1.467.400,03. Viene DISCRIMINADA por
-- cubierta, con tres precios distintos:
--
--   Relleno de 2 Hombros 275/80R-22.5 · PIRELLI 24        $100.991,74
--   Relleno de 2 Hombros 275/80R-22.5 · FATE 25           $100.991,74
--   Recap Radial Liso 235/75R-17.5 · x5                   $152.066,12 c/u
--   Recap Rad Taco Bandag 275/80R-22.5 · FATE 60          $250.413,22
--                                                        -------------
--                                                        $1.212.727,30
--
-- Reemplaza la imputación del 25/09 hecha a ojo (las chicas habían quedado en
-- $92.297,60 y las grandes al unitario de agosto). Setea valores absolutos, así
-- que se puede correr sobre lo que ya está cargado.
--
-- El 53082 NO se puede repartir plano: trae 6 cubiertas de la factura 18106 a
-- $250.413 y las dos de relleno a $100.991,74. Por eso los items se cargan uno
-- por uno y el costo_total es la suma, no una división.

BEGIN;

-- 1) 53083 — las 5 de 235/75R17.5, recap radial liso.
UPDATE mantenimiento_recapado_items i
   SET costo = 152066.12
  FROM mantenimiento_recapados r
 WHERE i.recapado_id = r.id
   AND r.numero_remito = '53083'
   AND r.proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL'
   AND i.resultado = 'recapada';

UPDATE mantenimiento_recapados
   SET costo_total = 760330.60, updated_at = now()
 WHERE numero_remito = '53083'
   AND proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL';

-- 2) 53082 — sólo la 24 y la 25 (relleno de hombros). Las otras 6 son de la
--    factura 18106 de agosto y quedan como están.
UPDATE mantenimiento_recapado_items i
   SET costo = 100991.74
  FROM mantenimiento_recapados r
 WHERE i.recapado_id = r.id
   AND r.numero_remito = '53082'
   AND r.proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL'
   AND i.resultado = 'recapada'
   AND COALESCE(i.numero_retorno, i.numero_envio) IN ('24', '25');

UPDATE mantenimiento_recapados r
   SET costo_total = (
         SELECT SUM(i.costo) FROM mantenimiento_recapado_items i
          WHERE i.recapado_id = r.id AND i.resultado = 'recapada'
       ),
       updated_at = now()
 WHERE r.numero_remito = '53082'
   AND r.proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL';

-- 3) El remito reconstruido de la 60 — recap con taco Bandag.
UPDATE mantenimiento_recapado_items i
   SET costo = 250413.22
  FROM mantenimiento_recapados r
 WHERE i.recapado_id = r.id
   AND r.numero_remito IS NULL
   AND r.proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL'
   AND i.resultado = 'recapada';

UPDATE mantenimiento_recapados
   SET costo_total = 250413.22, updated_at = now()
 WHERE numero_remito IS NULL
   AND proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL';

-- Control: la suma de los items tiene que dar igual al costo_total de cada
-- remito, y lo imputado a la 18230 tiene que dar $1.212.727,30.
SELECT COALESCE(r.numero_remito, '(sin número)') AS remito,
       r.costo_total,
       SUM(i.costo) FILTER (WHERE i.resultado = 'recapada') AS suma_items,
       COUNT(*)     FILTER (WHERE i.resultado = 'recapada') AS recapadas
  FROM mantenimiento_recapados r
  JOIN mantenimiento_recapado_items i ON i.recapado_id = r.id
 WHERE r.proveedor = 'RC RECONSTRUCTORA CONSTITUCIÓN SRL'
 GROUP BY r.id, r.numero_remito, r.costo_total
 ORDER BY 1;

COMMIT;
