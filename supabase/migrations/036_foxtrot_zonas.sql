-- =============================================
-- foxtrot_zonas: configuración de polígonos para zonificar
-- Norte / Central / Este / etc. Single-row con JSONB.
-- =============================================

CREATE TABLE foxtrot_zonas (
  id INTEGER PRIMARY KEY DEFAULT 1,
  zonas JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT foxtrot_zonas_single_row CHECK (id = 1)
);

ALTER TABLE foxtrot_zonas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foxtrot_zonas_read"
  ON foxtrot_zonas FOR SELECT TO authenticated USING (true);

CREATE POLICY "foxtrot_zonas_write_admin"
  ON foxtrot_zonas FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed inicial: zonas de Misiones (Norte=Iguazú, Central+Este=Eldorado)
-- Coords copiadas del zonas.json del dashboard original.
INSERT INTO foxtrot_zonas (id, zonas) VALUES (1, '{
  "Norte": {
    "color": "#ef4444",
    "coords": [
      [-25.557260355150323, -54.62539672851563],
      [-25.62233257436471, -54.42832946777344],
      [-25.55973778465726, -54.22],
      [-25.825341791612157, -54.342439725364635],
      [-25.696045569579255, -54.672088623046875]
    ]
  },
  "Central": {
    "color": "#f59e0b",
    "coords": [
      [-25.696045569579255, -54.672088623046875],
      [-25.825341791612157, -54.342439725364635],
      [-25.979024438312045, -54.507980346679695],
      [-26.378638846890247, -54.28138732910157],
      [-26.75, -54.42],
      [-26.740387394241527, -54.73834991455079],
      [-26.655438595628212, -54.79705810546876],
      [-26.610014788059534, -54.790878295898445],
      [-26.550114426316938, -54.81353759765626],
      [-26.512356362290667, -54.78675842285157],
      [-26.436756966583104, -54.705047607421875],
      [-26.30573793786406, -54.68788146972657],
      [-26.249061581007265, -54.694061279296875]
    ]
  },
  "Este": {
    "color": "#2dd4bf",
    "coords": [
      [-25.55973778465726, -54.22],
      [-25.55980270887192, -54.100799560546875],
      [-25.65877747227141, -53.81378173828125],
      [-25.948170910842485, -53.73550415039063],
      [-26.266295715384622, -53.64212036132813],
      [-26.645010719723697, -53.73825073242188],
      [-26.911032066129803, -53.686065673828125],
      [-27.066404221342868, -53.80142211914063],
      [-26.978343511817595, -54.14405822753907],
      [-26.887152755721768, -54.471588134765625],
      [-26.378638846890247, -54.28138732910157],
      [-25.979024438312045, -54.507980346679695],
      [-25.825341791612157, -54.342439725364635]
    ]
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE foxtrot_zonas IS 'Polígonos de zonas para clasificar PDVs en el dashboard de Foxtrot. Editable desde /indicadores/foxtrot-tracking/zonas (admin).';
