-- =============================================
-- Catálogo de sectores de empleado
-- Antes los sectores estaban hardcodeados en el frontend
-- (Distribución / Depósito / Sin asignar). Esta tabla permite
-- gestionarlos desde /admin/mapeo-empleados.
-- =============================================

CREATE TABLE sectores_empleado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  -- Los sectores "core" no se pueden renombrar ni borrar porque hay
  -- lógica de la app que depende del literal exacto (mis-capacitaciones,
  -- filtros de flota, etc.)
  es_core BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sectores_empleado_orden ON sectores_empleado(orden);

CREATE TRIGGER trg_sectores_empleado_updated
  BEFORE UPDATE ON sectores_empleado
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Sembrar los sectores existentes + cualquiera ya cargado en empleados
INSERT INTO sectores_empleado (nombre, es_core, orden) VALUES
  ('Distribución', true, 10),
  ('Depósito', true, 20),
  ('Sin asignar', true, 999)
ON CONFLICT (nombre) DO NOTHING;

-- Traer sectores que ya existan en empleados pero no estén en el catálogo
INSERT INTO sectores_empleado (nombre, es_core, orden)
SELECT DISTINCT e.sector, false, 100
FROM empleados e
WHERE e.sector IS NOT NULL
  AND TRIM(e.sector) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM sectores_empleado s WHERE s.nombre = e.sector
  );

-- RLS
ALTER TABLE sectores_empleado ENABLE ROW LEVEL SECURITY;

-- Lectura: todos los autenticados (se usa en varios dropdowns)
CREATE POLICY "Authenticated can read sectores_empleado"
  ON sectores_empleado FOR SELECT
  TO authenticated
  USING (true);

-- Escritura: solo admin
CREATE POLICY "Admin can manage sectores_empleado"
  ON sectores_empleado FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
