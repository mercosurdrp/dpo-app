-- =============================================
-- Registro de Combustible + Odómetro en Checklist
-- Para cálculo de rendimiento (km/litro)
-- =============================================

-- Agregar odómetro al checklist de vehículos
ALTER TABLE checklist_vehiculos ADD COLUMN odometro INTEGER;

-- =============================================
-- Tabla de registros de combustible
-- =============================================
CREATE TABLE registro_combustible (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  dominio TEXT NOT NULL,
  chofer TEXT NOT NULL,
  odometro INTEGER NOT NULL,
  litros NUMERIC(8,2) NOT NULL,
  -- km recorridos desde última carga (se calcula automáticamente)
  km_recorridos INTEGER,
  -- rendimiento km/litro (se calcula automáticamente)
  rendimiento NUMERIC(6,2),
  tipo_combustible TEXT NOT NULL DEFAULT 'gasoil',
  proveedor TEXT,
  numero_remito TEXT,
  costo_total NUMERIC(10,2),
  observaciones TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reg_comb_fecha ON registro_combustible(fecha);
CREATE INDEX idx_reg_comb_dominio ON registro_combustible(dominio);
CREATE INDEX idx_reg_comb_chofer ON registro_combustible(chofer);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE registro_combustible ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read registro_combustible"
  ON registro_combustible FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert registro_combustible"
  ON registro_combustible FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update registro_combustible"
  ON registro_combustible FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can delete registro_combustible"
  ON registro_combustible FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
