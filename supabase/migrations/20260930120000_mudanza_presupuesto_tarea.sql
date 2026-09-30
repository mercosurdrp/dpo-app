-- Mudanza "Express a San Nicolás": presupuesto por tarea.
-- Cada tarea lleva su monto presupuestado; lo real gastado sale de mudanza_gastos.tarea_id.
-- Semilla: reparte las partidas del Excel "Inversion Mudanza" entre las tareas equivalentes
-- (sólo donde todavía no hay presupuesto cargado). Aditiva e idempotente.
BEGIN;

ALTER TABLE mudanza_tareas ADD COLUMN IF NOT EXISTS presupuesto numeric(14,2);
CREATE INDEX IF NOT EXISTS mudanza_gastos_tarea_idx ON mudanza_gastos(tarea_id);

UPDATE mudanza_tareas t SET presupuesto = v.monto
FROM (VALUES
  ('l01',  2500000),   -- Habilitación / estudios
  ('o01',  2000000),   -- División durlock
  ('o03',  2000000),   -- Pintura de piso
  ('o04',  3000000),   -- Herrería rejas
  ('o06',  2400000),   -- 6 aires × 400.000
  ('s01', 30000000),   -- Cámaras
  ('s02',  1000000),   -- Alarma tesorería
  ('tr01',10000000),   -- Armado de racks
  ('tr02', 1000000),   -- Alquiler autoelevador
  ('tr04',  250000),   -- Mobiliario: 5 viajes × 50.000
  ('tr06', 1250000),   -- Vacíos: 25 viajes × 50.000
  ('tr08', 2500000),   -- Stock: 50 viajes × 50.000
  ('tr10', 2600000),   -- 2 contenedores × 1.300.000
  ('v01',  5000000)    -- Reacondicionamiento depósito actual
) AS v(codigo, monto)
WHERE t.codigo = v.codigo AND t.presupuesto IS NULL;

COMMIT;
