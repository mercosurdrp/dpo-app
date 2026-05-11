-- =============================================================
-- APLICAR EN SUPABASE SQL EDITOR (una sola vez)
-- Proyecto: tpafgmbhnucdiavvxbcg
-- Copiar TODO este archivo y ejecutar en:
--   https://supabase.com/dashboard/project/tpafgmbhnucdiavvxbcg/sql/new
-- =============================================================
-- Migración 058 — 6 KPIs warehouse + tabla apertura picking
-- Archivo fuente: supabase/migrations/058_reuniones_kpis_complementarios_y_apertura_picking.sql
-- Idempotente: se puede ejecutar varias veces sin efectos colaterales.
-- =============================================================

BEGIN;

-- a) 6 KPIs en reuniones_indicadores_config (tipo='warehouse')
INSERT INTO reuniones_indicadores_config (tipo, nombre, unidad, meta, orden, activo, agregacion)
SELECT 'warehouse', v.nombre, v.unidad, NULL::numeric, v.orden, true, v.agregacion
FROM (VALUES
  ('WQI',                       'PPM',   10, 'promedio'),
  ('FGLI',                      'HL',    20, 'suma'),
  ('SCL',                       '$',     30, 'suma'),
  ('Precision picking',         '%',     40, 'promedio'),
  ('Capacidad utilizada',       '%',     50, 'promedio'),
  ('Productividad de picking',  'HL/HH', 60, 'promedio')
) AS v(nombre, unidad, orden, agregacion)
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_indicadores_config c
  WHERE c.tipo = 'warehouse' AND c.nombre = v.nombre
);

-- b) Tabla de apertura por operador (Troli/Galvez/Ovejero por reunion)
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

DROP POLICY IF EXISTS "reunion_apertura_picking_select_auth" ON reunion_apertura_picking;
CREATE POLICY "reunion_apertura_picking_select_auth"
  ON reunion_apertura_picking FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reunion_apertura_picking_write_auth" ON reunion_apertura_picking;
CREATE POLICY "reunion_apertura_picking_write_auth"
  ON reunion_apertura_picking FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
