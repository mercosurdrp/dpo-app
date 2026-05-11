-- =============================================
-- 058 · Reuniones · KPIs complementarios + apertura por operador
-- =============================================
-- Cambios:
--   a) Inserta 4 indicadores de logistica que faltaban segun handbook 2025:
--      FGLI (HL, suma), SCL ($, suma), Precision picking (%, promedio),
--      Capacidad utilizada (%, promedio).
--   b) Crea tabla reunion_apertura_picking para el sub-cuadro de operadores
--      (Troli/Galvez/Ovejero) en cada reunion: bultos, errores, hl_hh.
--
-- Idempotente. Reload de schema cache PostgREST al final, fuera de COMMIT.
-- =============================================

BEGIN;

-- =============================================
-- a) 4 KPIs complementarios en reuniones_indicadores_config (tipo='logistica')
-- =============================================
INSERT INTO reuniones_indicadores_config (tipo, nombre, unidad, meta, orden, activo, agregacion)
SELECT 'logistica', v.nombre, v.unidad, NULL::numeric, v.orden, true, v.agregacion
FROM (VALUES
  ('Precision picking',   '%',  115, 'promedio'),
  ('FGLI',                'HL', 145, 'suma'),
  ('SCL',                 '$',  155, 'suma'),
  ('Capacidad utilizada', '%',  160, 'promedio')
) AS v(nombre, unidad, orden, agregacion)
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_indicadores_config c
  WHERE c.tipo = 'logistica' AND c.nombre = v.nombre
);

-- =============================================
-- b) Tabla de apertura por operador
-- =============================================
CREATE TABLE IF NOT EXISTS reunion_apertura_picking (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id  uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  operador    text NOT NULL,
  bultos      int,
  errores     int,
  hl_hh       numeric(14,2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reunion_id, operador)
);

CREATE INDEX IF NOT EXISTS idx_reunion_apertura_picking_reunion
  ON reunion_apertura_picking(reunion_id);

ALTER TABLE reunion_apertura_picking ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado
DROP POLICY IF EXISTS "reunion_apertura_picking_select_auth" ON reunion_apertura_picking;
CREATE POLICY "reunion_apertura_picking_select_auth"
  ON reunion_apertura_picking FOR SELECT TO authenticated
  USING (true);

-- Escritura: cualquier usuario autenticado (mismo criterio que reuniones_indicadores_valores)
DROP POLICY IF EXISTS "reunion_apertura_picking_write_auth" ON reunion_apertura_picking;
CREATE POLICY "reunion_apertura_picking_write_auth"
  ON reunion_apertura_picking FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- =============================================
-- c) Reload schema cache de PostgREST (fuera de transaccion)
-- =============================================
NOTIFY pgrst, 'reload schema';
