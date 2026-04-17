-- =============================================
-- 5S (Cinco Eses) — Auditorías de Flota y Almacén
-- =============================================

-- =============================================
-- Enums
-- =============================================
CREATE TYPE s5_tipo AS ENUM ('flota', 'almacen');

CREATE TYPE s5_categoria AS ENUM (
  'organizacion',
  'orden',
  'limpieza',
  'estandarizacion',
  'disciplina'
);

CREATE TYPE s5_auditoria_estado AS ENUM ('borrador', 'completada');

-- =============================================
-- Catálogo maestro de ítems
-- =============================================
CREATE TABLE s5_items_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo s5_tipo NOT NULL,
  categoria s5_categoria NOT NULL,
  numero INT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  orden INT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tipo, numero)
);

CREATE INDEX idx_s5_items_catalogo_tipo ON s5_items_catalogo(tipo);
CREATE INDEX idx_s5_items_catalogo_categoria ON s5_items_catalogo(categoria);

-- =============================================
-- Responsables de sector (almacén) por mes
-- Sectores fijos 1..4. Un responsable por sector y período.
-- =============================================
CREATE TABLE s5_sector_responsables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo DATE NOT NULL, -- siempre día 01 del mes
  sector_numero INT NOT NULL CHECK (sector_numero BETWEEN 1 AND 4),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  asignado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (periodo, sector_numero)
);

CREATE INDEX idx_s5_sector_resp_periodo ON s5_sector_responsables(periodo);
CREATE INDEX idx_s5_sector_resp_empleado ON s5_sector_responsables(empleado_id);

-- =============================================
-- Auditorías 5S
-- =============================================
CREATE TABLE s5_auditorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo s5_tipo NOT NULL,
  periodo DATE NOT NULL, -- día 01 del mes
  fecha DATE NOT NULL,
  auditor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  -- Específicos flota
  vehiculo_id UUID REFERENCES catalogo_vehiculos(id) ON DELETE SET NULL,
  chofer_nombre TEXT,
  ayudante_1 TEXT,
  ayudante_2 TEXT,

  -- Específicos almacén
  sector_numero INT CHECK (sector_numero BETWEEN 1 AND 4),

  estado s5_auditoria_estado NOT NULL DEFAULT 'borrador',
  nota_total NUMERIC(5,2),
  notas_por_s JSONB,
  observaciones_generales TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (
    (tipo = 'flota' AND sector_numero IS NULL)
    OR (tipo = 'almacen' AND vehiculo_id IS NULL AND chofer_nombre IS NULL)
  )
);

CREATE INDEX idx_s5_auditorias_tipo_periodo ON s5_auditorias(tipo, periodo);
CREATE INDEX idx_s5_auditorias_auditor ON s5_auditorias(auditor_id);
CREATE INDEX idx_s5_auditorias_vehiculo ON s5_auditorias(vehiculo_id);
CREATE INDEX idx_s5_auditorias_sector ON s5_auditorias(sector_numero);
CREATE INDEX idx_s5_auditorias_created_at ON s5_auditorias(created_at DESC);

-- =============================================
-- Respuestas (puntaje por ítem)
-- =============================================
CREATE TABLE s5_auditoria_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id UUID NOT NULL REFERENCES s5_auditorias(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES s5_items_catalogo(id) ON DELETE RESTRICT,
  puntaje INT,
  observaciones TEXT,
  UNIQUE (auditoria_id, item_id)
);

CREATE INDEX idx_s5_auditoria_items_auditoria ON s5_auditoria_items(auditoria_id);

-- =============================================
-- Triggers updated_at
-- =============================================
CREATE TRIGGER trg_s5_auditorias_updated_at
  BEFORE UPDATE ON s5_auditorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_s5_sector_responsables_updated_at
  BEFORE UPDATE ON s5_sector_responsables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE s5_items_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE s5_sector_responsables ENABLE ROW LEVEL SECURITY;
ALTER TABLE s5_auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE s5_auditoria_items ENABLE ROW LEVEL SECURITY;

-- Items catálogo: lectura a todos, escritura sólo admin
CREATE POLICY "s5_items_catalogo_read"
  ON s5_items_catalogo FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_items_catalogo_insert"
  ON s5_items_catalogo FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "s5_items_catalogo_update"
  ON s5_items_catalogo FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "s5_items_catalogo_delete"
  ON s5_items_catalogo FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Sector responsables: lectura authenticated; escritura admin/auditor
CREATE POLICY "s5_sector_responsables_read"
  ON s5_sector_responsables FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_sector_responsables_insert"
  ON s5_sector_responsables FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_sector_responsables_update"
  ON s5_sector_responsables FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_sector_responsables_delete"
  ON s5_sector_responsables FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

-- Auditorías: lectura authenticated; escritura admin/auditor
CREATE POLICY "s5_auditorias_read"
  ON s5_auditorias FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_auditorias_insert"
  ON s5_auditorias FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_auditorias_update"
  ON s5_auditorias FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_auditorias_delete"
  ON s5_auditorias FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

-- Auditoria items: mismo patrón que auditorias
CREATE POLICY "s5_auditoria_items_read"
  ON s5_auditoria_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_auditoria_items_insert"
  ON s5_auditoria_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_auditoria_items_update"
  ON s5_auditoria_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_auditoria_items_delete"
  ON s5_auditoria_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

-- =============================================
-- Seed de ítems: FLOTA (19)
-- =============================================
INSERT INTO s5_items_catalogo (tipo, categoria, numero, titulo, descripcion, orden) VALUES
-- Organización (1-3)
('flota','organizacion',1,'Materiales','¿Hay material innecesario en la cabina del camión?',1),
('flota','organizacion',2,'Información','¿El camión tiene números de emergencia e info a la vista?',2),
('flota','organizacion',3,'Objetos personales','¿Hay objetos personales innecesarios en la cabina?',3),
-- Orden (4-7)
('flota','orden',4,'Cesto de basura','¿Hay cesto/almacenamiento de basura dentro del camión?',4),
('flota','orden',5,'Selección','¿El camión tiene estandarizados los lugares para cada cosa?',5),
('flota','orden',6,'Seguridad','¿Hay ítems que representen condiciones inseguras?',6),
('flota','orden',7,'Kit de Limpieza','¿Hay ítems o kits de limpieza disponibles en el camión?',7),
-- Limpieza (8-12)
('flota','limpieza',8,'Limpieza general','¿El camión presenta buenas condiciones de limpieza?',8),
('flota','limpieza',9,'Almacenamiento limpio','¿Todos los lugares de almacenamiento están limpios y disponibles?',9),
('flota','limpieza',10,'Check Diario','¿Hay checklist diario cuando el camión sale del CD?',10),
('flota','limpieza',11,'Mantenimiento','¿El camión presenta buenas condiciones de mantenimiento?',11),
('flota','limpieza',12,'Mantenimiento ágil','¿Las cuestiones de mantenimiento se resuelven rápidamente?',12),
-- Estandarización (13-15)
('flota','estandarizacion',13,'RACI','¿Hay alineamiento claro de reglas y responsabilidades de 5S?',13),
('flota','estandarizacion',14,'Estándar 5S camiones','¿Hay estándar de 5S de camiones, choferes con conocimiento?',14),
('flota','estandarizacion',15,'Control','¿Hay lista de todo lo que debe almacenarse en la cabina?',15),
-- Disciplina (16-19)
('flota','disciplina',16,'Estandarización aplicada','¿Choferes y ayudantes conocen y aplican el estándar 5S?',16),
('flota','disciplina',17,'Auditoría','¿Hay rutina de auditoría mensual, choferes conocen los resultados?',17),
('flota','disciplina',18,'Acciones','¿Hay plan de acción para tratar brechas?',18),
('flota','disciplina',19,'Reconocimiento','¿Hay programa de reconocimiento para el mejor equipo 5S?',19);

-- =============================================
-- Seed de ítems: ALMACÉN (30)
-- =============================================
INSERT INTO s5_items_catalogo (tipo, categoria, numero, titulo, descripcion, orden) VALUES
-- Organización (1-7)
('almacen','organizacion',1,'Circulación','¿Hay en el sector elementos que interfieran la normal circulación?',1),
('almacen','organizacion',2,'Materiales o insumos','¿Hay en el lugar materiales o insumos innecesarios?',2),
('almacen','organizacion',3,'Herramientas y equipos','¿Hay en el sector algún equipo o herramienta fuera de uso?',3),
('almacen','organizacion',4,'Identificación','En el caso de haber equipos innecesarios, ¿están identificados con tarjeta roja?',4),
('almacen','organizacion',5,'Piezas de repuesto','¿Hay piezas de repuestos innecesarias?',5),
('almacen','organizacion',6,'Elementos personales','¿Hay elementos personales fuera del lugar definido?',6),
('almacen','organizacion',7,'Información','¿Se encuentran registros/estándares/opls/carpetas en el lugar correcto?',7),
-- Orden (8-13)
('almacen','orden',8,'Layout','¿Existe un layout del sector con los sectores identificados?',8),
('almacen','orden',9,'Sendas peatonales','¿Las sendas peatonales y demarcaciones están adecuadas?',9),
('almacen','orden',10,'Identificación','¿Las carteleras, carpetas, material están identificados?',10),
('almacen','orden',11,'Contenedores','¿Los contenedores de residuos están identificados?',11),
('almacen','orden',12,'Productos Químicos','¿Productos químicos correctamente identificados?',12),
('almacen','orden',13,'Ubicación de objetos','¿Equipos, herramientas, insumos se encuentran en su lugar?',13),
-- Limpieza (14-18)
('almacen','limpieza',14,'Pisos','¿Los pisos están limpios, sin residuos?',14),
('almacen','limpieza',15,'Paredes y techos','¿Paredes y techos limpios, sin tierra ni telas de araña?',15),
('almacen','limpieza',16,'Ventanas','¿Ventanas limpias, sin vidrios rotos?',16),
('almacen','limpieza',17,'Herramientas y área','¿El sector y herramientas se encuentran limpias?',17),
('almacen','limpieza',18,'Inspección de la limpieza','¿La limpieza es monitoreada con check horarios?',18),
-- Estandarización (19-24)
('almacen','estandarizacion',19,'Propuestas de mejora','¿Se presentan ideas en el sector para mejorar 5S?',19),
('almacen','estandarizacion',20,'Implementación de Mejoras','¿Las ideas son analizadas y se da feedback?',20),
('almacen','estandarizacion',21,'Estándares','¿Se cuenta con un estándar de orden y limpieza?',21),
('almacen','estandarizacion',22,'Estándares de layout','¿Se evidencia layout con dueños definidos?',22),
('almacen','estandarizacion',23,'Seguimiento','¿Hay plan de acción para alcance de 5S?',23),
('almacen','estandarizacion',24,'Las primeras 3S','¿Es parte del trabajo cotidiano la organización, orden y limpieza?',24),
-- Disciplina (25-30)
('almacen','disciplina',25,'Monitoreo de 5S','¿Se realizan auto auditorías de 5S?',25),
('almacen','disciplina',26,'Auditorías cruzadas','¿Hay cronograma de auditorías cruzadas?',26),
('almacen','disciplina',27,'Estándares','¿Los estándares son revisados periódicamente?',27),
('almacen','disciplina',28,'Carteleras','¿Las carteleras se actualizan regularmente?',28),
('almacen','disciplina',29,'Evolución','¿Hallazgos de auditorías anteriores están resueltos?',29),
('almacen','disciplina',30,'Evidencia de mejora','¿Se puede mostrar evidencia de mejora en el sector?',30);
