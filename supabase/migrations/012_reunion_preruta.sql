-- =============================================
-- Reunión Pre-Ruta: check-in matinal
-- =============================================

CREATE TABLE reunion_preruta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legajo INT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_checkin TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Datos calculados del cruce con biométrico
  hora_fichaje TIMESTAMPTZ,          -- primera entrada biométrica del día
  minutos_fichaje_reunion NUMERIC,   -- diferencia en minutos (checkin - fichaje)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(legajo, fecha)
);

CREATE INDEX idx_reunion_preruta_fecha ON reunion_preruta(fecha);
CREATE INDEX idx_reunion_preruta_legajo ON reunion_preruta(legajo);

-- RLS
ALTER TABLE reunion_preruta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reunion_preruta_select"
  ON reunion_preruta FOR SELECT TO authenticated USING (true);

CREATE POLICY "reunion_preruta_insert"
  ON reunion_preruta FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "reunion_preruta_delete"
  ON reunion_preruta FOR DELETE TO authenticated USING (true);
