-- Dos PI de flota que los SOP definen y la app todavía no mostraba (26/08/2026):
--
--   * repuestos_trazabilidad (DPO 2.3) — el SOP de gestión de repuestos lo pide
--     como "repuestos de OT vinculados a un ítem del pañol ÷ repuestos de OT
--     que salieron del pañol".
--   * neumaticos_desgaste (DPO 3.4) — mm de dibujo por cada 1.000 km.
--
-- Las dos filas van con meta NULL a propósito: `updateFlotaMeta` es UPDATE-only
-- (la fila tiene que existir) y el número es decisión de la operación, no algo
-- que se pueda inventar desde el código.
--
--   * En trazabilidad, el denominador que la app puede medir son TODAS las
--     filas de repuesto de la OT, y las piezas compradas contra la OT no
--     vinculan por diseño: la meta es la proporción que se espera sacar del
--     pañol, no el 100 % del SOP.
--   * En desgaste todavía no hay tasa: las rondas no juntaron los km que pide
--     el ajuste. Poner una meta antes de tener la línea de base es lo que un
--     auditor desarma primero.

INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('repuestos_trazabilidad', NULL, '>=', '%',
   'R2.3.2 pide trazabilidad de la pieza al trabajo y del trabajo a la unidad. El vínculo del repuesto de la OT con el ítem del pañol es lo que hace que el egreso de stock exista: sin él, la pieza usada en depósito recién aparece como diferencia en el conteo físico del mes, sin causa. A COMPLETAR: la proporción de repuestos de OT que se espera que salgan del pañol (el resto se compra contra la OT y va directo a la unidad).'),
  ('neumaticos_desgaste', NULL, '<=', 'mm/1.000 km',
   'Las cubiertas son el principal consumible de la flota y el desgaste por km es lo que convierte la medición mensual en un costo por kilómetro. La tasa sale de la recta ajustada sobre todas las rondas del programa (piso 2026-07-01), no de restar la primera contra la última. A COMPLETAR: la meta se fija cuando el ajuste tenga km suficientes para dar una línea de base propia.')
ON CONFLICT (kpi) DO NOTHING;
