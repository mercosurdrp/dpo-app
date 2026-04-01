-- Novedades de asistencia (vacaciones, licencias, etc.)
CREATE TABLE asistencia_novedades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legajo INT NOT NULL,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vacaciones', 'licencia_medica', 'ausente', 'pergamino')),
  observaciones TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(legajo, fecha)
);

CREATE INDEX idx_asistencia_novedades_fecha ON asistencia_novedades(fecha);
CREATE INDEX idx_asistencia_novedades_legajo ON asistencia_novedades(legajo);

ALTER TABLE asistencia_novedades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asistencia_novedades_select"
  ON asistencia_novedades FOR SELECT TO authenticated USING (true);

CREATE POLICY "asistencia_novedades_insert"
  ON asistencia_novedades FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "asistencia_novedades_update"
  ON asistencia_novedades FOR UPDATE TO authenticated USING (true);

CREATE POLICY "asistencia_novedades_delete"
  ON asistencia_novedades FOR DELETE TO authenticated USING (true);
