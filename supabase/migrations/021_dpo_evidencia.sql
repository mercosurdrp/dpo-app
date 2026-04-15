-- =============================================
-- Gestión documental DPO: archivos, versiones, actividad
-- =============================================

-- Bucket de Storage para evidencia (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dpo-evidencia', 'dpo-evidencia', false)
ON CONFLICT (id) DO NOTHING;

-- Policies del bucket
CREATE POLICY "dpo_evidencia_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dpo-evidencia');
CREATE POLICY "dpo_evidencia_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dpo-evidencia');
CREATE POLICY "dpo_evidencia_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dpo-evidencia');
CREATE POLICY "dpo_evidencia_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'dpo-evidencia'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- Tabla de archivos (vigente)
-- =============================================
CREATE TABLE dpo_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilar_codigo TEXT NOT NULL,
  punto_codigo TEXT NOT NULL,
  requisito_codigo TEXT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  file_name TEXT NOT NULL,
  file_ext TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  current_file_path TEXT NOT NULL,
  current_file_size BIGINT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id),
  archivado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dpo_archivos_punto ON dpo_archivos(pilar_codigo, punto_codigo);
CREATE INDEX idx_dpo_archivos_requisito ON dpo_archivos(requisito_codigo);
CREATE INDEX idx_dpo_archivos_categoria ON dpo_archivos(categoria);
CREATE INDEX idx_dpo_archivos_archivado ON dpo_archivos(archivado);

-- =============================================
-- Versiones de cada archivo
-- =============================================
CREATE TABLE dpo_archivo_versiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_id UUID NOT NULL REFERENCES dpo_archivos(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  notas TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (archivo_id, version)
);

CREATE INDEX idx_dpo_archivo_versiones_archivo ON dpo_archivo_versiones(archivo_id);

-- =============================================
-- Timeline de actividad DPO (feed de evidencia global)
-- =============================================
CREATE TYPE dpo_actividad_tipo AS ENUM (
  'archivo_subido',
  'archivo_version_nueva',
  'archivo_editado',
  'archivo_eliminado',
  'plan_creado',
  'plan_actualizado',
  'plan_cerrado',
  'owd_creada',
  'cert_subida',
  'sop_actualizado',
  'sync_foxtrot',
  'registro_tml',
  'otro'
);

CREATE TABLE dpo_actividad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo dpo_actividad_tipo NOT NULL,
  pilar_codigo TEXT,
  punto_codigo TEXT,
  requisito_codigo TEXT,
  archivo_id UUID REFERENCES dpo_archivos(id) ON DELETE SET NULL,
  referencia_id UUID,
  referencia_tipo TEXT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  user_id UUID REFERENCES profiles(id),
  user_nombre TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dpo_actividad_pilar_punto ON dpo_actividad(pilar_codigo, punto_codigo);
CREATE INDEX idx_dpo_actividad_tipo ON dpo_actividad(tipo);
CREATE INDEX idx_dpo_actividad_fecha ON dpo_actividad(created_at DESC);
CREATE INDEX idx_dpo_actividad_user ON dpo_actividad(user_id);
CREATE INDEX idx_dpo_actividad_archivo ON dpo_actividad(archivo_id);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE dpo_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dpo_archivo_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE dpo_actividad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dpo_archivos_read" ON dpo_archivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "dpo_archivos_insert" ON dpo_archivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dpo_archivos_update" ON dpo_archivos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "dpo_archivos_delete" ON dpo_archivos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "dpo_archivo_versiones_read" ON dpo_archivo_versiones FOR SELECT TO authenticated USING (true);
CREATE POLICY "dpo_archivo_versiones_insert" ON dpo_archivo_versiones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dpo_archivo_versiones_delete" ON dpo_archivo_versiones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "dpo_actividad_read" ON dpo_actividad FOR SELECT TO authenticated USING (true);
CREATE POLICY "dpo_actividad_insert" ON dpo_actividad FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dpo_actividad_delete" ON dpo_actividad FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Trigger updated_at
CREATE TRIGGER dpo_archivos_updated_at
  BEFORE UPDATE ON dpo_archivos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
