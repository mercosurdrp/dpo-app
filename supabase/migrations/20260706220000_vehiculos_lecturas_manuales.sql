-- Lecturas manuales de odómetro/horómetro para unidades sin fuente automática
-- (autoelevadores sin checklist diario como TOYOTA3, camionetas del depósito
-- AF199RD/AF199RE). Se cargan desde el Tablero operativo de
-- /vehiculos/mantenimiento y alimentan el "km/hs actual" y la proyección del
-- service general (fetchLecturas las suma como fuente 'manual').
CREATE TABLE IF NOT EXISTS vehiculos_lecturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio text NOT NULL,
  fecha date NOT NULL,
  -- km u horas según el tipo de la unidad (los autoelevadores miden horómetro)
  valor numeric NOT NULL CHECK (valor >= 0),
  observaciones text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehiculos_lecturas_dominio_fecha_idx
  ON vehiculos_lecturas (dominio, fecha);

ALTER TABLE vehiculos_lecturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehiculos_lecturas_read" ON vehiculos_lecturas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vehiculos_lecturas_write" ON vehiculos_lecturas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));
