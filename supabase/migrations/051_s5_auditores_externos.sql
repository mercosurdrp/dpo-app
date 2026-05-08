-- =============================================
-- 5S — Auditores externos (sin login en la app)
-- Permite cargar auditorías cuyo auditor no es un profile de Supabase Auth.
-- =============================================

CREATE TABLE s5_auditores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_s5_auditores_activo ON s5_auditores(activo);

CREATE TRIGGER trg_s5_auditores_updated_at
  BEFORE UPDATE ON s5_auditores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_auditores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_auditores_read"
  ON s5_auditores FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_auditores_insert"
  ON s5_auditores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "s5_auditores_update"
  ON s5_auditores FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "s5_auditores_delete"
  ON s5_auditores FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================
-- s5_auditorias: aceptar auditor externo
-- auditor_id (profile) deja de ser obligatorio; se exige uno de los dos.
-- =============================================
ALTER TABLE s5_auditorias ALTER COLUMN auditor_id DROP NOT NULL;

ALTER TABLE s5_auditorias
  ADD COLUMN auditor_externo_id UUID REFERENCES s5_auditores(id) ON DELETE RESTRICT;

CREATE INDEX idx_s5_auditorias_auditor_externo ON s5_auditorias(auditor_externo_id);

ALTER TABLE s5_auditorias
  ADD CONSTRAINT s5_auditorias_auditor_check CHECK (
    (auditor_id IS NOT NULL AND auditor_externo_id IS NULL)
    OR (auditor_id IS NULL AND auditor_externo_id IS NOT NULL)
  );

-- Evidencia a nivel auditoría (un Google Form puede traer 1 foto por auditoría completa,
-- sin asociarse a un ítem en particular). Path al bucket s5-auditorias.
ALTER TABLE s5_auditorias
  ADD COLUMN evidencia_storage_path TEXT;
