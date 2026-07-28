-- =============================================
-- Reunión Warehouse · sorteo del expositor del día
-- =============================================
-- La reunión de Warehouse la abre un operador distinto cada día. Hasta ahora
-- se elegía de palabra; estas dos tablas guardan el plantel (con quién está
-- ausente) y el turno sorteado de cada día, para que la rotación sea pareja
-- y quede el registro de quién expuso.
--
-- Idempotente. Solo Pampeana.
-- =============================================

-- a) Plantel de operadores de almacén que pueden dar la reunión.
CREATE TABLE IF NOT EXISTS warehouse_expositor_plantel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN warehouse_expositor_plantel.activo IS
  'false = ausente (vacaciones, franco, licencia). No entra en el sorteo.';
COMMENT ON COLUMN warehouse_expositor_plantel.nota IS
  'Motivo de la ausencia, para que se entienda por qué quedó afuera.';

-- b) Turno sorteado por día. Una sola fila por fecha: volver a sortear pisa
--    la anterior (queda el expositor definitivo, no cada intento).
CREATE TABLE IF NOT EXISTS warehouse_expositor_turnos (
  fecha DATE PRIMARY KEY,
  nombre TEXT NOT NULL,
  sorteado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wh_expositor_turnos_nombre
  ON warehouse_expositor_turnos(nombre, fecha DESC);

-- c) Plantel inicial: los 8 operadores de almacén + Cerbin.
INSERT INTO warehouse_expositor_plantel (nombre, activo, nota)
VALUES
  ('Veidoski', true,  NULL),
  ('Sala',     true,  NULL),
  ('Troli',    true,  NULL),
  ('Galvez',   true,  NULL),
  ('Selenzo',  true,  NULL),
  ('Martinez', true,  NULL),
  ('Ovejero',  true,  NULL),
  ('Altube',   true,  NULL),
  ('Cerbin',   false, 'De vacaciones la semana del 27/07')
ON CONFLICT (nombre) DO NOTHING;

-- d) RLS: lo ve cualquiera logueado; el permiso de escritura se valida en la
--    server action (mismo criterio que el resto de la reunión).
ALTER TABLE warehouse_expositor_plantel ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_expositor_turnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wh_expositor_plantel_select_auth" ON warehouse_expositor_plantel;
CREATE POLICY "wh_expositor_plantel_select_auth"
  ON warehouse_expositor_plantel FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "wh_expositor_plantel_write_auth" ON warehouse_expositor_plantel;
CREATE POLICY "wh_expositor_plantel_write_auth"
  ON warehouse_expositor_plantel FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wh_expositor_turnos_select_auth" ON warehouse_expositor_turnos;
CREATE POLICY "wh_expositor_turnos_select_auth"
  ON warehouse_expositor_turnos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "wh_expositor_turnos_write_auth" ON warehouse_expositor_turnos;
CREATE POLICY "wh_expositor_turnos_write_auth"
  ON warehouse_expositor_turnos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON warehouse_expositor_plantel TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON warehouse_expositor_turnos TO authenticated;
GRANT ALL ON warehouse_expositor_plantel TO service_role;
GRANT ALL ON warehouse_expositor_turnos TO service_role;

NOTIFY pgrst, 'reload schema';
