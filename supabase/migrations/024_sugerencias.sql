-- =============================================
-- Sugerencias y Mejoras: tickets + comentarios
-- Kanban: nuevo → en_analisis → en_desarrollo → en_testeo → ok | rechazado
-- =============================================

-- Enums
CREATE TYPE sugerencia_tipo AS ENUM (
  'bug',
  'dato_incorrecto',
  'mejora_ux',
  'feature_request'
);

CREATE TYPE sugerencia_estado AS ENUM (
  'nuevo',
  'en_analisis',
  'en_desarrollo',
  'en_testeo',
  'ok',
  'rechazado'
);

CREATE TYPE sugerencia_prioridad AS ENUM (
  'baja',
  'media',
  'alta'
);

-- =============================================
-- Tabla principal
-- =============================================
CREATE TABLE sugerencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tipo sugerencia_tipo NOT NULL,
  estado sugerencia_estado NOT NULL DEFAULT 'nuevo',
  prioridad sugerencia_prioridad NOT NULL DEFAULT 'media',
  modulo TEXT,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  asignado_a UUID REFERENCES profiles(id) ON DELETE SET NULL,
  motivo_rechazo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sugerencias_estado ON sugerencias(estado);
CREATE INDEX idx_sugerencias_creado_por ON sugerencias(creado_por);
CREATE INDEX idx_sugerencias_created_at ON sugerencias(created_at DESC);
CREATE INDEX idx_sugerencias_asignado_a ON sugerencias(asignado_a);

-- =============================================
-- Comentarios
-- =============================================
CREATE TABLE sugerencia_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sugerencia_id UUID NOT NULL REFERENCES sugerencias(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sugerencia_comentarios_sugerencia ON sugerencia_comentarios(sugerencia_id);
CREATE INDEX idx_sugerencia_comentarios_created_at ON sugerencia_comentarios(created_at);

-- =============================================
-- Trigger updated_at (reusa update_updated_at existente)
-- =============================================
CREATE TRIGGER trg_sugerencias_updated_at
  BEFORE UPDATE ON sugerencias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE sugerencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE sugerencia_comentarios ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier authenticated
CREATE POLICY "sugerencias_read"
  ON sugerencias FOR SELECT TO authenticated USING (true);

-- Insert: authenticated con creado_por = auth.uid()
CREATE POLICY "sugerencias_insert"
  ON sugerencias FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

-- Update: admin o (autor y estado='nuevo'). El paso en_testeo→ok lo valida la server action.
CREATE POLICY "sugerencias_update"
  ON sugerencias FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (creado_por = auth.uid() AND estado = 'nuevo')
    OR (creado_por = auth.uid() AND estado = 'en_testeo')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (creado_por = auth.uid() AND estado IN ('nuevo', 'ok'))
  );

-- Delete: solo admin
CREATE POLICY "sugerencias_delete"
  ON sugerencias FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Comentarios
CREATE POLICY "sugerencia_comentarios_read"
  ON sugerencia_comentarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "sugerencia_comentarios_insert"
  ON sugerencia_comentarios FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid());

CREATE POLICY "sugerencia_comentarios_delete"
  ON sugerencia_comentarios FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
