-- =============================================
-- DPO App - Gestion Tables (Indicadores, Planes, Evidencias)
-- =============================================

-- Enum types
CREATE TYPE tipo_evidencia AS ENUM ('documento', 'foto', 'link', 'nota');
CREATE TYPE tendencia_tipo AS ENUM ('mejora', 'estable', 'deterioro', 'neutral');
CREATE TYPE estado_plan AS ENUM ('pendiente', 'en_progreso', 'completado');
CREATE TYPE prioridad_plan AS ENUM ('alta', 'media', 'baja');

-- =============================================
-- Tables
-- =============================================

-- indicadores (KPIs per question)
CREATE TABLE indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  meta NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual NUMERIC(10,2) NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT '%',
  tendencia tendencia_tipo NOT NULL DEFAULT 'neutral',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- planes_accion (action plans per question)
CREATE TABLE planes_accion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable TEXT NOT NULL,
  fecha_inicio DATE,
  fecha_limite DATE,
  estado estado_plan NOT NULL DEFAULT 'pendiente',
  prioridad prioridad_plan NOT NULL DEFAULT 'media',
  progreso INT NOT NULL DEFAULT 0 CHECK (progreso >= 0 AND progreso <= 100),
  notas TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evidencias (evidence items per question)
CREATE TABLE evidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  url TEXT,
  file_path TEXT,
  tipo tipo_evidencia NOT NULL DEFAULT 'documento',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- evidencia_planes (M2M: evidencia <-> plan de accion)
CREATE TABLE evidencia_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidencia_id UUID NOT NULL REFERENCES evidencias(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(evidencia_id, plan_id)
);

-- plan_comentarios (timeline comments on plans)
CREATE TABLE plan_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  foto_url TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- plan_historial (state change log for plans)
CREATE TABLE plan_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  estado_anterior estado_plan NOT NULL,
  estado_nuevo estado_plan NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX idx_indicadores_pregunta ON indicadores(pregunta_id);
CREATE INDEX idx_planes_accion_pregunta ON planes_accion(pregunta_id);
CREATE INDEX idx_planes_accion_estado ON planes_accion(estado);
CREATE INDEX idx_evidencias_pregunta ON evidencias(pregunta_id);
CREATE INDEX idx_evidencia_planes_evidencia ON evidencia_planes(evidencia_id);
CREATE INDEX idx_evidencia_planes_plan ON evidencia_planes(plan_id);
CREATE INDEX idx_plan_comentarios_plan ON plan_comentarios(plan_id);
CREATE INDEX idx_plan_historial_plan ON plan_historial(plan_id);

-- =============================================
-- Triggers (reuse existing update_updated_at function)
-- =============================================

CREATE TRIGGER trg_indicadores_updated_at
  BEFORE UPDATE ON indicadores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_planes_accion_updated_at
  BEFORE UPDATE ON planes_accion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE planes_accion ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidencia_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_historial ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read everything
CREATE POLICY "Authenticated users can read indicadores"
  ON indicadores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read planes_accion"
  ON planes_accion FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read evidencias"
  ON evidencias FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read evidencia_planes"
  ON evidencia_planes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read plan_comentarios"
  ON plan_comentarios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read plan_historial"
  ON plan_historial FOR SELECT TO authenticated USING (true);

-- Admin + Auditor can write indicadores
CREATE POLICY "Admin and auditor can insert indicadores"
  ON indicadores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can update indicadores"
  ON indicadores FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete indicadores"
  ON indicadores FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can write planes_accion
CREATE POLICY "Admin and auditor can insert planes_accion"
  ON planes_accion FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can update planes_accion"
  ON planes_accion FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete planes_accion"
  ON planes_accion FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can write evidencias
CREATE POLICY "Admin and auditor can insert evidencias"
  ON evidencias FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete evidencias"
  ON evidencias FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can write evidencia_planes
CREATE POLICY "Admin and auditor can insert evidencia_planes"
  ON evidencia_planes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can delete evidencia_planes"
  ON evidencia_planes FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

-- Admin + Auditor can write plan_comentarios
CREATE POLICY "Admin and auditor can insert plan_comentarios"
  ON plan_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete plan_comentarios"
  ON plan_comentarios FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can insert plan_historial
CREATE POLICY "Admin and auditor can insert plan_historial"
  ON plan_historial FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

-- =============================================
-- Storage bucket for evidencias/photos
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('evidencias', 'evidencias', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload evidencias"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidencias');

CREATE POLICY "Anyone can read evidencias"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evidencias');

CREATE POLICY "Admin can delete evidencias files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
