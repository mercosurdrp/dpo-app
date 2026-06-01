-- =============================================
-- 090 · Períodos Críticos R3.4.2 — Revisión mensual + TOR (Book de Actas)
-- =============================================
-- Cumple R3.4.2 del manual DPO (pilar Planeamiento, punto 3.4):
--   "El distribuidor revisa el plan de período crítico mensualmente en la
--    reunión de ventas y logística y si el período crítico está cerca, la
--    rutina está en su lugar siguiendo TOR de planificación del período
--    crítico."
--
-- Agrega:
--   • reuniones_tor / reuniones_tor_items → Book de Actas (TOR) editable por
--     tipo de reunión. Seed inicial para 'logistica-ventas' desde el Excel
--     "3.1 TOR (VENT - LOG - COMP)".
--   • pc_revisiones_mensuales → 1 registro por mes de la revisión del plan de
--     períodos críticos, ligada a la reunión logística-ventas donde se hizo.
--   • pc_revision_evidencias → action log de evidencias de cada revisión
--     (réplica de reuniones_actividades_evidencias, mig 066). Bucket 'reuniones'.
--
-- RLS sigue el patrón pc_* (mig 085): read = authenticated, write = roles
-- admin/admin_rrhh/supervisor. Idempotente. NOTIFY pgrst al final.
-- =============================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TOR (Book de Actas) — cabecera por tipo de reunión
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reuniones_tor (
  tipo         TEXT PRIMARY KEY REFERENCES reuniones_tipos_config(tipo) ON DELETE CASCADE,
  objetivos    TEXT NOT NULL DEFAULT '',
  dueno        TEXT NOT NULL DEFAULT '',
  ubicacion    TEXT NOT NULL DEFAULT '',
  dia_horario  TEXT NOT NULL DEFAULT '',
  frecuencia   TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_reuniones_tor_updated_at ON reuniones_tor;
CREATE TRIGGER trg_reuniones_tor_updated_at
  BEFORE UPDATE ON reuniones_tor
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Listas del TOR: participantes, reglas, entradas, salidas, KPIs, temario.
-- responsable solo aplica a la sección 'temario'.
CREATE TABLE IF NOT EXISTS reuniones_tor_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL REFERENCES reuniones_tipos_config(tipo) ON DELETE CASCADE,
  seccion      TEXT NOT NULL CHECK (seccion IN
                 ('participante','regla','entrada','salida','kpi','temario')),
  orden        INT  NOT NULL DEFAULT 0,
  texto        TEXT NOT NULL,
  responsable  TEXT
);

CREATE INDEX IF NOT EXISTS idx_reuniones_tor_items_tipo_seccion
  ON reuniones_tor_items(tipo, seccion, orden);

-- ---------------------------------------------------------------------------
-- 2. Revisión mensual del plan de períodos críticos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pc_revisiones_mensuales (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio               INT  NOT NULL,
  mes                INT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  reunion_id         UUID REFERENCES reuniones(id) ON DELETE SET NULL,
  conclusiones       TEXT NOT NULL DEFAULT '',
  -- Snapshot de los períodos críticos próximos detectados al registrar.
  periodos_revisados JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado             TEXT NOT NULL DEFAULT 'realizada'
                       CHECK (estado IN ('pendiente','realizada')),
  realizada_por      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  realizada_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_pc_revisiones_anio_mes
  ON pc_revisiones_mensuales(anio, mes);

-- Action log de evidencias de cada revisión (réplica de mig 066).
CREATE TABLE IF NOT EXISTS pc_revision_evidencias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id    UUID NOT NULL
                   REFERENCES pc_revisiones_mensuales(id) ON DELETE CASCADE,
  comentario     TEXT,
  archivo_path   TEXT,                      -- bucket 'reuniones', prefijo 'revisiones-pc/{revision_id}/'
  archivo_nombre TEXT,
  archivo_mime   TEXT,
  archivo_bytes  BIGINT,
  autor_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pc_revision_evid_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_pc_revision_evid_revision
  ON pc_revision_evidencias(revision_id);

-- ---------------------------------------------------------------------------
-- 3. RLS (patrón pc_*: read authenticated, write admin/admin_rrhh/supervisor)
-- ---------------------------------------------------------------------------
ALTER TABLE reuniones_tor            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones_tor_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_revisiones_mensuales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_revision_evidencias   ENABLE ROW LEVEL SECURITY;

-- reuniones_tor
DROP POLICY IF EXISTS "reuniones_tor_read" ON reuniones_tor;
CREATE POLICY "reuniones_tor_read"
  ON reuniones_tor FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "reuniones_tor_write" ON reuniones_tor;
CREATE POLICY "reuniones_tor_write"
  ON reuniones_tor FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- reuniones_tor_items
DROP POLICY IF EXISTS "reuniones_tor_items_read" ON reuniones_tor_items;
CREATE POLICY "reuniones_tor_items_read"
  ON reuniones_tor_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "reuniones_tor_items_write" ON reuniones_tor_items;
CREATE POLICY "reuniones_tor_items_write"
  ON reuniones_tor_items FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- pc_revisiones_mensuales
DROP POLICY IF EXISTS "pc_revisiones_read" ON pc_revisiones_mensuales;
CREATE POLICY "pc_revisiones_read"
  ON pc_revisiones_mensuales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_revisiones_write" ON pc_revisiones_mensuales;
CREATE POLICY "pc_revisiones_write"
  ON pc_revisiones_mensuales FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

-- pc_revision_evidencias
DROP POLICY IF EXISTS "pc_revision_evid_read" ON pc_revision_evidencias;
CREATE POLICY "pc_revision_evid_read"
  ON pc_revision_evidencias FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_revision_evid_write" ON pc_revision_evidencias;
CREATE POLICY "pc_revision_evid_write"
  ON pc_revision_evidencias FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

GRANT ALL ON reuniones_tor, reuniones_tor_items,
             pc_revisiones_mensuales, pc_revision_evidencias
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Seed TOR para 'logistica-ventas' (Excel "3.1 TOR (VENT - LOG - COMP)")
-- ---------------------------------------------------------------------------
INSERT INTO reuniones_tor (tipo, objetivos, dueno, ubicacion, dia_horario, frecuencia)
VALUES (
  'logistica-ventas',
  'Realizar seguimiento de los indicadores de ambas áreas y definir acciones en caso de desvíos.',
  'JDL',
  'Sala de Ventas / Sala de Reuniones',
  'Lunes 10:30 hs · Duración 45 min',
  'Semanal (lunes)'
)
ON CONFLICT (tipo) DO NOTHING;

-- Items: solo sembrar si el tipo aún no tiene items (idempotente).
INSERT INTO reuniones_tor_items (tipo, seccion, orden, texto, responsable)
SELECT * FROM (VALUES
  -- Participantes
  ('logistica-ventas','participante',1,'JDV', NULL),
  ('logistica-ventas','participante',2,'JDL', NULL),
  ('logistica-ventas','participante',3,'Analista de Compras', NULL),
  ('logistica-ventas','participante',4,'JDA', NULL),
  -- Reglas
  ('logistica-ventas','regla',1,'Ser puntual con la reunión.', NULL),
  ('logistica-ventas','regla',2,'En caso de que haya un inconveniente que impida a alguna parte asistir, avisar con anticipación.', NULL),
  ('logistica-ventas','regla',3,'Comenzar repasando temas pendientes de reuniones anteriores.', NULL),
  ('logistica-ventas','regla',4,'Tener preparados los temas a tratar previamente para no demorar en cada punto.', NULL),
  ('logistica-ventas','regla',5,'Todos los integrantes deben saber actualizar la herramienta digital TEAMS.', NULL),
  -- Entradas
  ('logistica-ventas','entrada',1,'Action Logs previos', NULL),
  ('logistica-ventas','entrada',2,'Reporte de Seguridad KPI (incidentes y condiciones inseguras en PDV)', NULL),
  ('logistica-ventas','entrada',3,'Planificación de volumen semanal ventas (proyección)', NULL),
  ('logistica-ventas','entrada',4,'Planificación de Compras (proyección)', NULL),
  ('logistica-ventas','entrada',5,'Seguimiento de los SLA Ventas-Logística', NULL),
  ('logistica-ventas','entrada',6,'PDA productos comprometidos (frescura)', NULL),
  -- Salidas
  ('logistica-ventas','salida',1,'Equipos alineados', NULL),
  ('logistica-ventas','salida',2,'Alineamiento de GAP y plan de acción', NULL),
  ('logistica-ventas','salida',3,'Alineamiento / compromiso de foco entre las áreas', NULL),
  ('logistica-ventas','salida',4,'Acciones de plan días pico', NULL),
  -- KPIs
  ('logistica-ventas','kpi',1,'TRI', NULL),
  ('logistica-ventas','kpi',2,'CXC', NULL),
  ('logistica-ventas','kpi',3,'Frescura', NULL),
  ('logistica-ventas','kpi',4,'Cumplimiento SLA', NULL),
  ('logistica-ventas','kpi',5,'Niveles de Stock y necesidades', NULL),
  ('logistica-ventas','kpi',6,'NPS - RMD (KPI centrado en el cliente)', NULL),
  ('logistica-ventas','kpi',7,'OTIF (KPI centrado en el cliente)', NULL),
  ('logistica-ventas','kpi',8,'Rechazos', NULL),
  ('logistica-ventas','kpi',9,'Plan territorial', NULL),
  ('logistica-ventas','kpi',10,'Plan agrupación de clientes', NULL),
  -- Temario (con responsable)
  ('logistica-ventas','temario',1,'Revisar el Action Log de la semana anterior','JDL/JDV'),
  ('logistica-ventas','temario',2,'Revisar reporte KPI','JDL/JDV'),
  ('logistica-ventas','temario',3,'Revisar en conjunto evolución de SLA','JDL/JDV'),
  ('logistica-ventas','temario',4,'Planificación de volumen semanal (proyección)','JDV'),
  ('logistica-ventas','temario',5,'Planificación de volumen de Compras (proyección de retiro)','ANALISTA DE COMPRAS'),
  ('logistica-ventas','temario',6,'Compartir con ventas hallazgos de OWD en ruta','JDL'),
  ('logistica-ventas','temario',7,'Compartir con ventas los Feedback de choferes','JDL')
) AS v(tipo, seccion, orden, texto, responsable)
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_tor_items WHERE tipo = 'logistica-ventas'
);

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
