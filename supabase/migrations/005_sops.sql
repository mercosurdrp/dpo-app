-- =============================================
-- DPO App - SOPs (Standard Operating Procedures) per Pilar
-- =============================================

CREATE TABLE sops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilar_id UUID NOT NULL REFERENCES pilares(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sop_versiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  version INT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  notas TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sops_pilar ON sops(pilar_id);
CREATE INDEX idx_sop_versiones_sop ON sop_versiones(sop_id);

-- Trigger
CREATE TRIGGER trg_sops_updated_at
  BEFORE UPDATE ON sops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_versiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sops"
  ON sops FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read sop_versiones"
  ON sop_versiones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and auditor can insert sops"
  ON sops FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can update sops"
  ON sops FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete sops"
  ON sops FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin and auditor can insert sop_versiones"
  ON sop_versiones FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

-- Storage bucket for SOPs (separate from evidencias)
INSERT INTO storage.buckets (id, name, public) VALUES ('sops', 'sops', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload sops"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sops');

CREATE POLICY "Anyone can read sops files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sops');

CREATE POLICY "Admin can delete sops files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sops'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
