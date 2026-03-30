-- =============================================
-- Registros de Vehículos (Ingreso/Egreso)
-- Para cálculo de TML (Tiempo Medio de Liberación)
-- =============================================

CREATE TYPE tipo_registro_vehiculo AS ENUM ('ingreso', 'egreso');

CREATE TABLE registros_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_registro_vehiculo NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  dominio TEXT NOT NULL,
  chofer TEXT NOT NULL,
  ayudante1 TEXT,
  ayudante2 TEXT,
  odometro INTEGER,
  hora TIME NOT NULL,
  semana INTEGER NOT NULL,
  -- TML en minutos (solo para egresos): hora - 07:00
  tml_minutos INTEGER,
  observaciones TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reg_veh_fecha ON registros_vehiculos(fecha);
CREATE INDEX idx_reg_veh_tipo ON registros_vehiculos(tipo);
CREATE INDEX idx_reg_veh_dominio ON registros_vehiculos(dominio);
CREATE INDEX idx_reg_veh_chofer ON registros_vehiculos(chofer);
CREATE INDEX idx_reg_veh_semana ON registros_vehiculos(semana);

-- RLS
ALTER TABLE registros_vehiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read registros_vehiculos"
  ON registros_vehiculos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert registros_vehiculos"
  ON registros_vehiculos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin can update registros_vehiculos"
  ON registros_vehiculos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete registros_vehiculos"
  ON registros_vehiculos FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Tabla de catálogo: choferes y vehículos conocidos
CREATE TABLE catalogo_choferes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalogo_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE catalogo_choferes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo_vehiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read catalogo_choferes"
  ON catalogo_choferes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage catalogo_choferes"
  ON catalogo_choferes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated can read catalogo_vehiculos"
  ON catalogo_vehiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage catalogo_vehiculos"
  ON catalogo_vehiculos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
