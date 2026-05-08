-- =============================================
-- 5S: fotos por ítem de auditoría + acciones (puntos a resolver)
-- =============================================

-- =============================================
-- Enum de estado de acción
-- =============================================
CREATE TYPE s5_accion_estado AS ENUM ('pendiente', 'resuelto');

-- =============================================
-- Fotos por ítem de auditoría
-- Se guardan en bucket 's5-auditorias' en Supabase Storage
-- =============================================
CREATE TABLE s5_auditoria_item_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_item_id UUID NOT NULL REFERENCES s5_auditoria_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL,
  subido_por UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_s5_item_fotos_item ON s5_auditoria_item_fotos(auditoria_item_id);
CREATE INDEX idx_s5_item_fotos_subido_por ON s5_auditoria_item_fotos(subido_por);

ALTER TABLE s5_auditoria_item_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_item_fotos_read"
  ON s5_auditoria_item_fotos FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_item_fotos_insert"
  ON s5_auditoria_item_fotos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_item_fotos_delete"
  ON s5_auditoria_item_fotos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

-- =============================================
-- Acciones: puntos observados en una auditoría a resolver
-- =============================================
CREATE TABLE s5_auditoria_acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id UUID NOT NULL REFERENCES s5_auditorias(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  estado s5_accion_estado NOT NULL DEFAULT 'pendiente',
  notas_resolucion TEXT,
  foto_resolucion_path TEXT,
  resuelto_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_resolucion TIMESTAMPTZ,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_s5_acciones_auditoria ON s5_auditoria_acciones(auditoria_id);
CREATE INDEX idx_s5_acciones_responsable ON s5_auditoria_acciones(responsable_profile_id);
CREATE INDEX idx_s5_acciones_estado ON s5_auditoria_acciones(estado);

CREATE TRIGGER trg_s5_acciones_updated_at
  BEFORE UPDATE ON s5_auditoria_acciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_auditoria_acciones ENABLE ROW LEVEL SECURITY;

-- Lectura: todos los autenticados
CREATE POLICY "s5_acciones_read"
  ON s5_auditoria_acciones FOR SELECT TO authenticated USING (true);

-- Insert: admin/auditor (se crean desde el detalle de la auditoría)
CREATE POLICY "s5_acciones_insert"
  ON s5_auditoria_acciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

-- Update: admin/auditor pueden modificar cualquiera, y el responsable puede
-- actualizar SU propia acción (para marcarla como resuelta).
CREATE POLICY "s5_acciones_update"
  ON s5_auditoria_acciones FOR UPDATE TO authenticated
  USING (
    responsable_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

-- Delete: admin/auditor
CREATE POLICY "s5_acciones_delete"
  ON s5_auditoria_acciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));
