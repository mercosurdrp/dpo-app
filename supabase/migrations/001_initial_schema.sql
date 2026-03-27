-- =============================================
-- DPO App - Initial Schema
-- =============================================

-- Enum types
CREATE TYPE user_role AS ENUM ('admin', 'auditor', 'viewer');
CREATE TYPE estado_auditoria AS ENUM ('borrador', 'en_progreso', 'completada', 'archivada');
CREATE TYPE estado_accion AS ENUM ('pendiente', 'en_progreso', 'completado');

-- =============================================
-- Tables
-- =============================================

-- profiles (linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- pilares (7 rows, seeded separately)
CREATE TABLE pilares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  orden INT NOT NULL,
  color TEXT NOT NULL,
  icono TEXT NOT NULL,
  meta NUMERIC(4,2) DEFAULT 0.60
);

-- bloques (62 rows)
CREATE TABLE bloques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilar_id UUID NOT NULL REFERENCES pilares(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INT NOT NULL
);

-- preguntas (168 rows)
CREATE TABLE preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloque_id UUID NOT NULL REFERENCES bloques(id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  numero TEXT NOT NULL,
  texto TEXT NOT NULL,
  mandatorio BOOLEAN NOT NULL DEFAULT false,
  peso NUMERIC(4,2) NOT NULL DEFAULT 1,
  guia TEXT,
  requerimiento TEXT,
  puntaje_criterio JSONB NOT NULL DEFAULT '{}',
  como_verificar TEXT
);

-- auditorias
CREATE TABLE auditorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  estado estado_auditoria NOT NULL DEFAULT 'borrador',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- respuestas
CREATE TABLE respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id UUID NOT NULL REFERENCES auditorias(id) ON DELETE CASCADE,
  pregunta_id UUID NOT NULL REFERENCES preguntas(id),
  puntaje INT CHECK (puntaje IN (0, 1, 3, 5)),
  comentario TEXT,
  evidencia_urls TEXT[] DEFAULT '{}',
  auditor_id UUID NOT NULL REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auditoria_id, pregunta_id)
);

-- acciones
CREATE TABLE acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respuesta_id UUID NOT NULL REFERENCES respuestas(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable TEXT NOT NULL,
  fecha_limite DATE NOT NULL,
  estado estado_accion NOT NULL DEFAULT 'pendiente',
  evidencia_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- Indexes
-- =============================================

CREATE INDEX idx_bloques_pilar ON bloques(pilar_id);
CREATE INDEX idx_preguntas_bloque ON preguntas(bloque_id);
CREATE INDEX idx_auditorias_estado ON auditorias(estado);
CREATE INDEX idx_auditorias_created_by ON auditorias(created_by);
CREATE INDEX idx_respuestas_auditoria ON respuestas(auditoria_id);
CREATE INDEX idx_respuestas_pregunta ON respuestas(pregunta_id);
CREATE INDEX idx_respuestas_auditor ON respuestas(auditor_id);
CREATE INDEX idx_acciones_respuesta ON acciones(respuesta_id);
CREATE INDEX idx_acciones_estado ON acciones(estado);
CREATE INDEX idx_profiles_role ON profiles(role);

-- =============================================
-- updated_at trigger function
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_auditorias_updated_at
  BEFORE UPDATE ON auditorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_respuestas_updated_at
  BEFORE UPDATE ON respuestas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_acciones_updated_at
  BEFORE UPDATE ON acciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Auto-create profile on auth signup
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, nombre, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilares ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloques ENABLE ROW LEVEL SECURITY;
ALTER TABLE preguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read everything
CREATE POLICY "Authenticated users can read profiles"
  ON profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read pilares"
  ON pilares FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read bloques"
  ON bloques FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read preguntas"
  ON preguntas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read auditorias"
  ON auditorias FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read respuestas"
  ON respuestas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read acciones"
  ON acciones FOR SELECT TO authenticated
  USING (true);

-- Admin can manage profiles
CREATE POLICY "Admin can insert profiles"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.uid() = id  -- allow trigger to create own profile
  );

CREATE POLICY "Admin can update profiles"
  ON profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR auth.uid() = id  -- users can update own profile
  );

CREATE POLICY "Admin can delete profiles"
  ON profiles FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can write auditorias
CREATE POLICY "Admin and auditor can insert auditorias"
  ON auditorias FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can update auditorias"
  ON auditorias FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete auditorias"
  ON auditorias FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can write respuestas
CREATE POLICY "Admin and auditor can insert respuestas"
  ON respuestas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can update respuestas"
  ON respuestas FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete respuestas"
  ON respuestas FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin + Auditor can write acciones
CREATE POLICY "Admin and auditor can insert acciones"
  ON acciones FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin and auditor can update acciones"
  ON acciones FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

CREATE POLICY "Admin can delete acciones"
  ON acciones FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
