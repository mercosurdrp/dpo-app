-- =============================================
-- tiempo_ruta_objetivos_zona: meta y tolerancia (en minutos) por zona Foxtrot
-- para el indicador "Tiempo en Ruta" basado en datos de Foxtrot (Misiones).
-- Las zonas referencian los polígonos definidos en foxtrot_zonas.
-- =============================================

CREATE TABLE tiempo_ruta_objetivos_zona (
  zona TEXT PRIMARY KEY,
  meta_minutos INTEGER NOT NULL CHECK (meta_minutos > 0 AND meta_minutos <= 1440),
  tolerancia_minutos INTEGER NOT NULL DEFAULT 60 CHECK (tolerancia_minutos >= 0 AND tolerancia_minutos <= 1440),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE tiempo_ruta_objetivos_zona ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiempo_ruta_objetivos_zona_read"
  ON tiempo_ruta_objetivos_zona FOR SELECT TO authenticated USING (true);

CREATE POLICY "tiempo_ruta_objetivos_zona_write_admin"
  ON tiempo_ruta_objetivos_zona FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed: 8h meta + 60min tolerancia para las 3 zonas configuradas en foxtrot_zonas.
INSERT INTO tiempo_ruta_objetivos_zona (zona, meta_minutos, tolerancia_minutos) VALUES
  ('Norte',   480, 60),
  ('Central', 480, 60),
  ('Este',    480, 60)
ON CONFLICT (zona) DO NOTHING;

COMMENT ON TABLE tiempo_ruta_objetivos_zona IS
  'Meta y tolerancia (minutos) para Tiempo en Ruta por zona Foxtrot. Editable desde /indicadores/tiempo-ruta-foxtrot/objetivos (admin).';
