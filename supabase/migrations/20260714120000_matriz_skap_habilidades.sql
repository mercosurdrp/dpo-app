-- =============================================
-- Matriz SKAP — Matriz de Habilidades por rol
-- Pilar GENTE 4.4
--
-- Distinta de sop_certificaciones (certificación de SOPs: vigente/vencida).
-- Acá se modela: habilidad -> estándar requerido -> evaluación de la persona
-- -> gap -> plan de formación que cierra el gap.
--
-- Escala de evaluación (0-4):
--   0 no conoce | 1 opera con limitaciones | 2 opera sin ayuda, sin teoría
--   3 aplica teoría y práctica sin errores | 4 puede instruir a otros
-- Criticidad: A crítica | B requerida | C excelencia
-- =============================================

-- 1. Catálogo de habilidades por rol (el "padrón": qué se le pide a cada puesto)
CREATE TABLE IF NOT EXISTS skap_habilidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol TEXT NOT NULL CHECK (rol IN ('chofer','ayudante','pickero','autoelevadorista','mantenimiento','administrativo')),
  bloque TEXT NOT NULL,
  criticidad TEXT NOT NULL CHECK (criticidad IN ('A','B','C')),
  habilidad TEXT NOT NULL,
  estandar SMALLINT NOT NULL CHECK (estandar BETWEEN 0 AND 4),
  orden SMALLINT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rol, habilidad)
);
CREATE INDEX IF NOT EXISTS idx_skap_hab_rol ON skap_habilidades(rol) WHERE activo;

-- 2. Qué rol SKAP tiene cada empleado.
--    Es una tabla aparte (y no empleados.puesto) porque una persona puede tener
--    más de un rol: Selenzo es pickero Y autoelevadorista, y se lo evalúa en los dos.
CREATE TABLE IF NOT EXISTS skap_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('chofer','ayudante','pickero','autoelevadorista','mantenimiento','administrativo')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empleado_id, rol)
);
CREATE INDEX IF NOT EXISTS idx_skap_asig_rol ON skap_asignaciones(rol) WHERE activo;

-- 3. Evaluaciones. Historial completo: NO se pisa la nota, se agrega una nueva
--    con su fecha. Así se ve la evolución de la persona en cada habilidad.
--    estandar_individual: override del estándar general para esa persona
--    (Esteban le exige 4 a Mantenimiento donde el general es 3). NULL = usa el general.
--    nivel NULL = "NA" (no aplica a esta persona).
CREATE TABLE IF NOT EXISTS skap_evaluaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  habilidad_id UUID NOT NULL REFERENCES skap_habilidades(id) ON DELETE CASCADE,
  fecha_evaluacion DATE NOT NULL,
  nivel SMALLINT CHECK (nivel BETWEEN 0 AND 4),
  estandar_individual SMALLINT CHECK (estandar_individual BETWEEN 0 AND 4),
  observaciones TEXT,
  evaluador_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empleado_id, habilidad_id, fecha_evaluacion)
);
CREATE INDEX IF NOT EXISTS idx_skap_eval_empleado ON skap_evaluaciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_skap_eval_habilidad ON skap_evaluaciones(habilidad_id);
CREATE INDEX IF NOT EXISTS idx_skap_eval_fecha ON skap_evaluaciones(fecha_evaluacion DESC);

-- 4. Plan de formación: cómo se cierra el gap de cada habilidad.
--    Es el contenido que ya viene definido en los Excel (alcance, horas, quién
--    capacita, con qué material). Una habilidad puede tener 0 o 1 plan.
CREATE TABLE IF NOT EXISTS skap_plan_formacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habilidad_id UUID NOT NULL REFERENCES skap_habilidades(id) ON DELETE CASCADE,
  alcance TEXT,
  hs_teoricas NUMERIC(4,1),
  hs_practicas NUMERIC(4,1),
  experto TEXT,
  instructor TEXT,
  tutor TEXT,
  metodo TEXT,
  criterio_evaluacion TEXT,
  material TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (habilidad_id)
);

-- 5. Acciones de formación: el seguimiento propiamente dicho. De cada gap sale
--    una acción, se programa, se dicta y se reevalúa. Esto es lo que hace que
--    la matriz sea un ciclo cerrado y no una foto.
CREATE TABLE IF NOT EXISTS skap_acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  habilidad_id UUID NOT NULL REFERENCES skap_habilidades(id) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','programada','realizada','cerrada')),
  fecha_programada DATE,
  fecha_realizada DATE,
  responsable TEXT,
  nivel_origen SMALLINT,          -- nivel que tenía cuando se abrió la acción
  observaciones TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skap_acc_empleado ON skap_acciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_skap_acc_estado ON skap_acciones(estado);
-- Una sola acción abierta por (persona, habilidad); cerradas puede haber muchas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_skap_acc_abierta
  ON skap_acciones(empleado_id, habilidad_id)
  WHERE estado <> 'cerrada';

-- RLS: lectura para cualquier autenticado; la escritura la controla el server
-- action (requireRole + chequeo de sector), igual que el resto de los módulos.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['skap_habilidades','skap_asignaciones','skap_evaluaciones','skap_plan_formacion','skap_acciones']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR SELECT TO authenticated USING (true);
    $f$, t || '_read', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR INSERT TO authenticated WITH CHECK (true);
    $f$, t || '_insert', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR UPDATE TO authenticated USING (true);
    $f$, t || '_update', t);
    EXECUTE format($f$
      CREATE POLICY %1$I ON %2$I FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','admin_rrhh'))
      );
    $f$, t || '_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
                   t || '_updated_at', t);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
