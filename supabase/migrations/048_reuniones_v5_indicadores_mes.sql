-- =============================================
-- 047 · Reuniones v5 · Indicadores: agregación mensual
-- =============================================
-- Cambios respecto a 046:
--   a) Agrega columna `agregacion` a reuniones_indicadores_config
--      ('suma' | 'promedio'), default 'promedio'.
--   b) Borra los 3 indicadores dummy de tipo 'logistica' (los otros tipos
--      conservan sus dummies por ahora).
--   c) Inserta 15 indicadores reales de logística con su unidad, orden y
--      agregación. Targets en NULL (admin los carga después).
--
-- Idempotente. Reload de schema cache PostgREST al final, fuera de COMMIT.
-- =============================================

BEGIN;

-- =============================================
-- a) Columna agregacion
-- =============================================
ALTER TABLE reuniones_indicadores_config
  ADD COLUMN IF NOT EXISTS agregacion text NOT NULL DEFAULT 'promedio'
  CHECK (agregacion IN ('suma', 'promedio'));

-- =============================================
-- b) Borrar dummies de logística
-- =============================================
-- ON DELETE CASCADE en reuniones_indicadores_valores hace cleanup automático.
DELETE FROM reuniones_indicadores_config
WHERE tipo = 'logistica' AND nombre LIKE 'Indicador % (dummy)';

-- =============================================
-- c) Insertar 15 indicadores reales de logística
-- =============================================
-- Idempotente con NOT EXISTS por (tipo, nombre).
INSERT INTO reuniones_indicadores_config (tipo, nombre, unidad, meta, orden, activo, agregacion)
SELECT 'logistica', v.nombre, v.unidad, NULL::numeric, v.orden, true, v.agregacion
FROM (VALUES
  ('LTI',                       'cant.',   10, 'suma'),
  ('TRI',                       'cant.',   20, 'suma'),
  ('Ausentismo',                '%',       30, 'promedio'),
  ('Bultos totales',            'bultos',  40, 'suma'),
  ('Cantidad de camiones',      'u.',      50, 'promedio'),
  ('Rechazo',                   '%',       60, 'promedio'),
  ('TML',                       'min',     70, 'promedio'),
  ('TLP',                       'min',     80, 'promedio'),
  ('Driver Click Score',        'pts',     90, 'promedio'),
  ('Tiempo en ruta',            'hs',     100, 'promedio'),
  ('Productividad de picking',  'bul/hr', 110, 'promedio'),
  ('WNP',                       '%',      120, 'promedio'),
  ('Faltantes',                 'cant.',  130, 'suma'),
  ('Roturas',                   'cant.',  140, 'suma'),
  ('WQI',                       '%',      150, 'promedio')
) AS v(nombre, unidad, orden, agregacion)
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_indicadores_config c
  WHERE c.tipo = 'logistica' AND c.nombre = v.nombre
);

COMMIT;

-- =============================================
-- d) Reload schema cache de PostgREST (fuera de transacción)
-- =============================================
NOTIFY pgrst, 'reload schema';
