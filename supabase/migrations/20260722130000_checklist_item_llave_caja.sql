-- Checklist de vehículos: ítem "¿La llave estaba debidamente guardada en su
-- caja de llaves?" para camiones y autoelevadores.
--
-- De acá en adelante lo responde el chofer/maquinista (OK / NO OK, no crítico),
-- SOLO en el checklist de liberación. De acá para atrás se backfillea en OK
-- todos los checklists de liberación ya registrados.
--
-- Hasta ahora todo ítem activo aparecía en los dos checklists del día
-- (liberación y retorno). Se agrega `tipo_check` para poder acotarlo:
--   NULL         → aparece en liberación y retorno (comportamiento actual)
--   'liberacion' → solo en la salida
--   'retorno'    → solo en la entrada
BEGIN;

-- 1) Columna para acotar un ítem a un momento del día. NULL = ambos, así los
--    30 ítems existentes no cambian de comportamiento.
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS tipo_check tipo_checklist NULL;

COMMENT ON COLUMN checklist_items.tipo_check IS
  'NULL = el ítem aparece en liberación y retorno; si no, solo en ese tipo de checklist.';

-- 2) Los dos ítems nuevos, con UUID fijo para que el backfill de abajo sea
--    determinista y esta migración se pueda correr más de una vez sin duplicar.
--    tipo_vehiculo NULL = checklist general de camiones.
INSERT INTO checklist_items
  (id, categoria, nombre, descripcion, critico, tipo_respuesta, orden, active, tipo_vehiculo, tipo_check)
VALUES
  ('9a1f7c30-4b2e-4d51-8c66-1f0a3b7d5e01',
   'SEGURIDAD',
   '¿La llave estaba debidamente guardada en su caja de llaves?',
   NULL, false, 'ok_nook', 31, true, NULL, 'liberacion'),
  ('9a1f7c30-4b2e-4d51-8c66-1f0a3b7d5e02',
   'SEGURIDAD',
   '¿La llave estaba debidamente guardada en su caja de llaves?',
   NULL, false, 'ok_nook', 12, true, 'autoelevador', 'liberacion')
ON CONFLICT (id) DO UPDATE
  SET nombre     = EXCLUDED.nombre,
      categoria  = EXCLUDED.categoria,
      critico    = EXCLUDED.critico,
      orden      = EXCLUDED.orden,
      active     = EXCLUDED.active,
      tipo_check = EXCLUDED.tipo_check;

-- 3) Backfill: 'ok' en todos los checklists de LIBERACIÓN ya registrados.
--    El tipo de unidad se resuelve por dominio contra catalogo_vehiculos
--    (checklist_vehiculos.tipo es el tipo de CHECK, no el de vehículo).
--    Las camionetas quedan fuera a propósito: no llevan este ítem.
--    El UNIQUE (checklist_id, item_id) + ON CONFLICT lo hace re-ejecutable.
INSERT INTO checklist_respuestas (checklist_id, item_id, valor, comentario)
SELECT
  cv.id,
  CASE WHEN cat.tipo = 'autoelevador'
       THEN '9a1f7c30-4b2e-4d51-8c66-1f0a3b7d5e02'::uuid
       ELSE '9a1f7c30-4b2e-4d51-8c66-1f0a3b7d5e01'::uuid
  END,
  'ok',
  NULL
FROM checklist_vehiculos cv
JOIN catalogo_vehiculos cat ON cat.dominio = cv.dominio
WHERE cv.tipo = 'liberacion'
  AND cat.tipo IN ('camion', 'autoelevador')
ON CONFLICT (checklist_id, item_id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
