-- Dimensionamiento — horas extra PRESUPUESTADAS por mes y sector (SOLO Pampeana)
--
-- Cierra el R2.3.2 del punto DPO Planeamiento 2.3: "se ha definido parámetros para
-- alertar al equipo sobre el tamaño diferente a la presupuestada de mano de obra /
-- flota debido a excedentes o falta de la misma". El auditor lo pidió por escrito
-- ("continuar trabajando en definir parámetros para alertar...").
--
-- Hasta ahora el módulo comparaba lo necesario contra lo que HAY, nunca contra lo
-- que el presupuesto FINANCIÓ. Con esto, las horas extra que proyecta el modelo se
-- semaforizan contra las presupuestadas: verde si entran, rojo si se pasan.
--
-- Fuente: EERR PxQ MRP 2026 (bucket `presupuestos`), fila «Q Horas Extras» de la
-- hoja `ALMACEN PXQ mrp` y fila «q» del bloque HORAS EXTRAS de `ENTREGA PXQ mrp`.
-- Van en la misma tabla que el precio porque comparten grano (anio, mes) y se
-- editan juntas en la misma pantalla.

BEGIN;

ALTER TABLE dim_costo_hh
  ADD COLUMN IF NOT EXISTS hh_ppto_almacen numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hh_ppto_entrega numeric(10,2) NOT NULL DEFAULT 0;

UPDATE dim_costo_hh SET hh_ppto_almacen = v.alm, hh_ppto_entrega = v.ent
FROM (VALUES
  (1, 167.27, 349.0), (2, 158.36, 317.0), (3,  76.81, 246.0),
  (4,  82.50, 243.0), (5,  68.46, 287.0), (6,  40.22, 190.0),
  (7,  25.32, 258.0), (8,  26.00, 251.0), (9,  27.68, 263.0),
  (10, 25.03, 326.0), (11, 41.43, 307.0), (12, 178.63, 384.0)
) AS v(mes, alm, ent)
WHERE dim_costo_hh.anio = 2026 AND dim_costo_hh.mes = v.mes;

COMMIT;
