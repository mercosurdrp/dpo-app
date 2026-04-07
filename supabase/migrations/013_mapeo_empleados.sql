-- =============================================
-- Mapeo de identidades externas a empleados
-- Vincula fleteros (ERP) y choferes (TML) con legajo
-- =============================================

-- Tabla 1: Mapeo fletero ERP → empleado
-- ds_fletero_carga del Chess ERP (patente del vehículo) → empleado
CREATE TABLE mapeo_empleado_fletero (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  id_fletero_carga INTEGER,
  ds_fletero_carga TEXT NOT NULL UNIQUE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mapeo_fletero_empleado ON mapeo_empleado_fletero(empleado_id);
CREATE INDEX idx_mapeo_fletero_ds ON mapeo_empleado_fletero(ds_fletero_carga);

-- Tabla 2: Mapeo chofer TML → empleado
-- nombre del chofer en registros_vehiculos/catalogo_choferes → empleado
CREATE TABLE mapeo_empleado_chofer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  nombre_chofer TEXT NOT NULL UNIQUE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mapeo_chofer_empleado ON mapeo_empleado_chofer(empleado_id);
CREATE INDEX idx_mapeo_chofer_nombre ON mapeo_empleado_chofer(nombre_chofer);

-- Triggers updated_at (función update_updated_at ya existe de migración 001)
CREATE TRIGGER trg_mapeo_fletero_updated
  BEFORE UPDATE ON mapeo_empleado_fletero
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_mapeo_chofer_updated
  BEFORE UPDATE ON mapeo_empleado_chofer
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vista: empleado con todas sus identidades externas
CREATE OR REPLACE VIEW vista_empleado_completo AS
SELECT
  e.id AS empleado_id,
  e.legajo,
  e.nombre,
  e.sector,
  e.activo,
  f.id_fletero_carga,
  f.ds_fletero_carga,
  c.nombre_chofer
FROM empleados e
LEFT JOIN mapeo_empleado_fletero f ON f.empleado_id = e.id
LEFT JOIN mapeo_empleado_chofer c ON c.empleado_id = e.id;

-- RLS
ALTER TABLE mapeo_empleado_fletero ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapeo_empleado_chofer ENABLE ROW LEVEL SECURITY;

-- Lectura: todos los autenticados
CREATE POLICY "Authenticated can read mapeo_empleado_fletero"
  ON mapeo_empleado_fletero FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can read mapeo_empleado_chofer"
  ON mapeo_empleado_chofer FOR SELECT
  TO authenticated
  USING (true);

-- Escritura: solo admin
CREATE POLICY "Admin can manage mapeo_empleado_fletero"
  ON mapeo_empleado_fletero FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can manage mapeo_empleado_chofer"
  ON mapeo_empleado_chofer FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
