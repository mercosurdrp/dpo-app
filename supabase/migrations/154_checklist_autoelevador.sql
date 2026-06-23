-- =============================================
-- Checklist específico de Autoelevadores
-- Set de preguntas propio (distinto al de camiones), tomado del checklist
-- "Liberación AE" que se hacía en Cloudfleet. Se carga una vez, al inicio
-- del día (los autoelevadores NO tienen checklist de retorno).
-- =============================================

-- Discrimina a qué tipo de vehículo aplica cada ítem del checklist:
--   NULL          → checklist general (camiones / camionetas / utilitarios) — los 30 ítems existentes
--   'autoelevador' → checklist específico de autoelevadores — los 11 ítems de abajo
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS tipo_vehiculo vehiculo_tipo;

-- SEED: 11 ítems del checklist de autoelevador (idempotente: no re-inserta si ya existen)
INSERT INTO checklist_items (categoria, nombre, descripcion, critico, tipo_respuesta, orden, tipo_vehiculo)
SELECT v.categoria, v.nombre, v.descripcion, v.critico, v.tipo_respuesta::tipo_respuesta_checklist, v.orden, 'autoelevador'::vehiculo_tipo
FROM (VALUES
  -- CARROCERÍA
  ('CARROCERÍA', 'Estado de carrocería', 'Choques, rayones o daños visibles', false, 'bueno_regular_malo', 1),
  ('CARROCERÍA', 'Funcionamiento de bocina y alarma de retroceso', NULL, false, 'ok_nook', 2),
  ('CARROCERÍA', 'Estado de horquilla y uñas', NULL, false, 'bueno_regular_malo', 3),
  -- MOTOR
  ('MOTOR', '¿Nivel de combustible superior a 1/4 tanque?', NULL, false, 'ok_nook', 4),
  ('MOTOR', 'Pérdida de fluidos y/o alarmas', 'OK= No hay pérdida. REGULAR= Existe una leve presencia de fluidos. NO OK= La pérdida es abundante, la unidad no se puede usar', true, 'ok_regular_nook', 5),
  ('MOTOR', 'Nivel de aceite motor', NULL, false, 'ok_nook', 6),
  ('MOTOR', 'Nivel de agua', NULL, false, 'ok_nook', 7),
  -- NEUMÁTICOS
  ('NEUMÁTICOS', 'Estado del neumático (desgaste)', NULL, false, 'bueno_regular_malo', 8),
  -- SEGURIDAD
  ('SEGURIDAD', 'Estado del matafuegos', 'Verificar presión y vencimiento', true, 'ok_nook', 9),
  ('SEGURIDAD', '¿El cinturón de seguridad tiene un correcto funcionamiento?', 'Incluye el estado del cinturón de seguridad, si existe rotura o complicación en su funcionamiento', true, 'ok_nook', 10),
  ('SEGURIDAD', 'Estado del espejo retrovisor', NULL, false, 'ok_nook', 11)
) AS v(categoria, nombre, descripcion, critico, tipo_respuesta, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM checklist_items WHERE tipo_vehiculo = 'autoelevador'
);
