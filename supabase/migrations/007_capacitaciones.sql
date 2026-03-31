-- =============================================
-- DPO App - Capacitaciones Module
-- =============================================

-- Enum for capacitacion status
DO $$ BEGIN
  CREATE TYPE estado_capacitacion AS ENUM ('programada', 'en_curso', 'completada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum for asistencia result
DO $$ BEGIN
  CREATE TYPE resultado_capacitacion AS ENUM ('aprobado', 'desaprobado', 'pendiente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- Empleados table (extends profiles for employee data)
-- =============================================
CREATE TABLE empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  legajo INT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  numero_id TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- Capacitaciones table
-- =============================================
CREATE TABLE capacitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  instructor TEXT NOT NULL,
  fecha DATE NOT NULL,
  duracion_horas NUMERIC(5,1) NOT NULL DEFAULT 1,
  lugar TEXT,
  material_url TEXT,
  estado estado_capacitacion NOT NULL DEFAULT 'programada',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- Asistencias table (enrollment + attendance + grade)
-- =============================================
CREATE TABLE asistencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacitacion_id UUID NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  presente BOOLEAN NOT NULL DEFAULT false,
  nota NUMERIC(5,1) CHECK (nota IS NULL OR (nota >= 0 AND nota <= 100)),
  resultado resultado_capacitacion NOT NULL DEFAULT 'pendiente',
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(capacitacion_id, empleado_id)
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX idx_empleados_profile ON empleados(profile_id);
CREATE INDEX idx_empleados_legajo ON empleados(legajo);
CREATE INDEX idx_capacitaciones_fecha ON capacitaciones(fecha);
CREATE INDEX idx_capacitaciones_estado ON capacitaciones(estado);
CREATE INDEX idx_asistencias_capacitacion ON asistencias(capacitacion_id);
CREATE INDEX idx_asistencias_empleado ON asistencias(empleado_id);

-- =============================================
-- Triggers
-- =============================================
CREATE TRIGGER trg_empleados_updated_at
  BEFORE UPDATE ON empleados
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_capacitaciones_updated_at
  BEFORE UPDATE ON capacitaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_asistencias_updated_at
  BEFORE UPDATE ON asistencias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated
CREATE POLICY "Authenticated users can read empleados"
  ON empleados FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read capacitaciones"
  ON capacitaciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read asistencias"
  ON asistencias FOR SELECT TO authenticated USING (true);

-- Write: admin + auditor
CREATE POLICY "Admin and auditor can insert empleados"
  ON empleados FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin and auditor can update empleados"
  ON empleados FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin can delete empleados"
  ON empleados FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin and auditor can insert capacitaciones"
  ON capacitaciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin and auditor can update capacitaciones"
  ON capacitaciones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin can delete capacitaciones"
  ON capacitaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin and auditor can insert asistencias"
  ON asistencias FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin and auditor can update asistencias"
  ON asistencias FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor')));

CREATE POLICY "Admin can delete asistencias"
  ON asistencias FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================
-- Seed empleados
-- =============================================
INSERT INTO empleados (legajo, nombre, numero_id) VALUES
  (54, 'ACOSTA ANGEL', '33205114'),
  (62, 'ACOSTA JOEL EMANUEL', '38849761'),
  (48, 'ARANCIBIA JULIO CESAR', '35243859'),
  (174, 'AVALOS HUGO ALBERTO', '30683337'),
  (47, 'CERBIN ADRIAN', '22435580'),
  (45, 'CHURRUARIN OSCAR DANIEL', '29259341'),
  (28, 'CORDONE LUIS DARIO', '27937760'),
  (29, 'DAVALOS ARENA NICOLAS PABLO', '94121351'),
  (13, 'ESCOBAR ROBERTO', '22365794'),
  (60, 'FERNANDEZ LUCAS', '27978965'),
  (64, 'FRIAS ANGEL ERMINDO', '29095863'),
  (55, 'OLAZAGOITIA GABRIEL', '34452286'),
  (34, 'RIVERO EZEQUIEL JORGE', '32307039'),
  (50, 'RIVERO FEDERICO', '36467534'),
  (88, 'RIVERO LAUREANO', '28450149'),
  (83, 'RODRIGUEZ MARCELO', '24667105'),
  (35, 'RODRIGUEZ WALTER GUSTAVO', '25365516'),
  (11, 'SANDOVAL ANTONIO', '20475105'),
  (21, 'SEQUEIRA HUMBERTO DAVID', '32658032'),
  (25, 'SEQUEIRA WALTER DAMIAN', '29772068'),
  (140, 'TEVES JORGE EZEQUIEL', '37934203'),
  (56, 'TISEIRA HECTOR OSCAR', '21488413'),
  (18, 'ZACARIAS JUAN CARLOS', '25715965'),
  (121, 'ZACCO LORENZO', '41071335'),
  (65, 'ZARATE RODOLFO ADRIAN', '28673490');
