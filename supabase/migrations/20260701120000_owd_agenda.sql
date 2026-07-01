-- =============================================
-- Calendario/agenda de OWD: planificar en qué días se harán observaciones.
-- Aditivo e idempotente. RLS: lectura authenticated, escritura admin/supervisor
-- (patrón inline profiles.role, sin enums, compatible con ambos tenants).
-- =============================================

CREATE TABLE IF NOT EXISTS owd_agenda (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        UUID NOT NULL REFERENCES owd_templates(id) ON DELETE CASCADE,
  fecha              DATE NOT NULL,
  supervisor         TEXT,
  empleado_observado TEXT,
  nota               TEXT,
  estado             TEXT NOT NULL DEFAULT 'planificada'
                       CHECK (estado IN ('planificada','realizada','cancelada')),
  observacion_id     UUID REFERENCES owd_observaciones(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owd_agenda_fecha ON owd_agenda(fecha);
CREATE INDEX IF NOT EXISTS idx_owd_agenda_template ON owd_agenda(template_id);

DROP TRIGGER IF EXISTS trg_owd_agenda_updated_at ON owd_agenda;
CREATE TRIGGER trg_owd_agenda_updated_at
  BEFORE UPDATE ON owd_agenda
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE owd_agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owd_agenda_read" ON owd_agenda;
CREATE POLICY "owd_agenda_read" ON owd_agenda
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "owd_agenda_write" ON owd_agenda;
CREATE POLICY "owd_agenda_write" ON owd_agenda
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

GRANT ALL ON owd_agenda TO anon, authenticated, service_role;
