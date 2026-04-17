-- =============================================
-- M2M: vincular archivos DPO con planes de acción
-- =============================================

CREATE TABLE dpo_archivo_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_id UUID NOT NULL REFERENCES dpo_archivos(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (archivo_id, plan_id)
);

CREATE INDEX idx_dpo_archivo_planes_archivo ON dpo_archivo_planes(archivo_id);
CREATE INDEX idx_dpo_archivo_planes_plan ON dpo_archivo_planes(plan_id);

ALTER TABLE dpo_archivo_planes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dpo_archivo_planes_read"
  ON dpo_archivo_planes FOR SELECT TO authenticated USING (true);

CREATE POLICY "dpo_archivo_planes_insert"
  ON dpo_archivo_planes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "dpo_archivo_planes_delete"
  ON dpo_archivo_planes FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
