-- =============================================
-- DPO App - Capacitacion Exam System
-- =============================================

-- Questions for each capacitacion (multiple choice)
CREATE TABLE capacitacion_preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacitacion_id UUID NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  opciones JSONB NOT NULL DEFAULT '[]',
  respuesta_correcta INT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Employee answers
CREATE TABLE capacitacion_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacitacion_id UUID NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  pregunta_id UUID NOT NULL REFERENCES capacitacion_preguntas(id) ON DELETE CASCADE,
  respuesta_elegida INT NOT NULL,
  es_correcta BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(capacitacion_id, empleado_id, pregunta_id)
);

-- Indexes
CREATE INDEX idx_cap_preguntas_cap ON capacitacion_preguntas(capacitacion_id);
CREATE INDEX idx_cap_respuestas_cap ON capacitacion_respuestas(capacitacion_id);
CREATE INDEX idx_cap_respuestas_emp ON capacitacion_respuestas(empleado_id);

-- RLS
ALTER TABLE capacitacion_preguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacitacion_respuestas ENABLE ROW LEVEL SECURITY;

-- Read
CREATE POLICY "Authenticated users can read capacitacion_preguntas"
  ON capacitacion_preguntas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read capacitacion_respuestas"
  ON capacitacion_respuestas FOR SELECT TO authenticated USING (true);

-- Write preguntas: admin/auditor
CREATE POLICY "Admin and auditor can insert capacitacion_preguntas"
  ON capacitacion_preguntas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin and auditor can update capacitacion_preguntas"
  ON capacitacion_preguntas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin and auditor can delete capacitacion_preguntas"
  ON capacitacion_preguntas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

-- Write respuestas: all authenticated (empleados need to answer)
CREATE POLICY "Authenticated can insert capacitacion_respuestas"
  ON capacitacion_respuestas FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update capacitacion_respuestas"
  ON capacitacion_respuestas FOR UPDATE TO authenticated
  USING (true);

-- Also allow empleados to insert/update asistencias (they mark themselves present by answering)
CREATE POLICY "Empleados can update own asistencias"
  ON asistencias FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM empleados e
      JOIN profiles p ON p.id = e.profile_id
      WHERE e.id = asistencias.empleado_id AND p.id = auth.uid()
    )
  );
