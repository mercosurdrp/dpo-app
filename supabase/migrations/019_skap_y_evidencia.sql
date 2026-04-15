-- =============================================
-- Matriz SKAP + Evidencia de cierre plan acción TML
-- Pilar Entrega 1.1 — R1.1.3 + R1.1.4
-- =============================================

-- 1. Evidencia de cierre en plan de acción TML
ALTER TABLE tml_plan_accion ADD COLUMN IF NOT EXISTS evidencia_cierre_url TEXT;

-- 2. Certificaciones SOP por empleado (Matriz SKAP)
CREATE TABLE sop_certificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  sop_codigo TEXT NOT NULL,
  sop_titulo TEXT NOT NULL,
  fecha_certificacion DATE NOT NULL,
  score NUMERIC(5,2),
  aprobado BOOLEAN NOT NULL DEFAULT false,
  vencimiento DATE,
  evidencia_url TEXT,
  notas TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empleado_id, sop_codigo, fecha_certificacion)
);

CREATE INDEX idx_sop_cert_empleado ON sop_certificaciones(empleado_id);
CREATE INDEX idx_sop_cert_sop ON sop_certificaciones(sop_codigo);
CREATE INDEX idx_sop_cert_vencimiento ON sop_certificaciones(vencimiento);

ALTER TABLE sop_certificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sop_cert_read" ON sop_certificaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "sop_cert_insert" ON sop_certificaciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sop_cert_update" ON sop_certificaciones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "sop_cert_delete" ON sop_certificaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER sop_cert_updated_at
  BEFORE UPDATE ON sop_certificaciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
