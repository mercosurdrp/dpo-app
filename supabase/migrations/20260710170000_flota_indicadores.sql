-- =============================================
-- Tablero de Indicadores de Flota — /vehiculos/mantenimiento
-- Metas configurables por KPI + planes de acción por KPI y mes.
-- Planes: clon del patrón TML (018) / TI (089) con discriminador `kpi`
-- para que un mismo mes pueda tener un plan por cada indicador.
-- =============================================

-- Metas por KPI (editables desde el tablero; NULL = meta sin definir)
CREATE TABLE flota_metas (
  kpi TEXT PRIMARY KEY,
  meta NUMERIC,
  comparador TEXT NOT NULL DEFAULT '>=' CHECK (comparador IN ('>=', '<=')),
  unidad TEXT NOT NULL DEFAULT '%',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

-- Semillas: disponibilidad 98% viene de la planilla histórica (TARGET_DISP);
-- el resto son valores iniciales editables por admin desde la UI.
INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('disponibilidad',    98,   '>=', '%'),
  ('utilizacion',       85,   '>=', '%'),
  ('costo_total',       NULL, '<=', '$'),
  ('pct_preventivo',    60,   '>=', '%'),
  ('cumplimiento_plan', 90,   '>=', '%'),
  ('services_vencidos', 0,    '<=', '#');

-- Cabecera del plan (1 por KPI + mes-año)
CREATE TYPE plan_flota_estado AS ENUM ('abierto', 'en_progreso', 'cerrado');
CREATE TYPE plan_flota_item_estado AS ENUM ('pendiente', 'en_progreso', 'completado');

CREATE TABLE flota_plan_accion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi TEXT NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  valor_mes NUMERIC,
  meta_mes NUMERIC,
  causa_raiz TEXT NOT NULL,
  estado plan_flota_estado NOT NULL DEFAULT 'abierto',
  fecha_cierre DATE,
  resultado_cierre TEXT,
  evidencia_cierre_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kpi, year, mes)
);

CREATE INDEX idx_flota_plan_kpi_year_mes ON flota_plan_accion(kpi, year, mes);
CREATE INDEX idx_flota_plan_estado ON flota_plan_accion(estado);

-- Ítems de acción
CREATE TABLE flota_plan_accion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES flota_plan_accion(id) ON DELETE CASCADE,
  accion TEXT NOT NULL,
  responsable TEXT NOT NULL,
  fecha_compromiso DATE NOT NULL,
  estado plan_flota_item_estado NOT NULL DEFAULT 'pendiente',
  fecha_completado DATE,
  observaciones TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flota_plan_items_plan ON flota_plan_accion_items(plan_id);

-- RLS
ALTER TABLE flota_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE flota_plan_accion ENABLE ROW LEVEL SECURITY;
ALTER TABLE flota_plan_accion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flota_metas_read" ON flota_metas FOR SELECT TO authenticated USING (true);
CREATE POLICY "flota_metas_update" ON flota_metas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "flota_plan_read" ON flota_plan_accion FOR SELECT TO authenticated USING (true);
CREATE POLICY "flota_plan_insert" ON flota_plan_accion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "flota_plan_update" ON flota_plan_accion FOR UPDATE TO authenticated USING (true);
CREATE POLICY "flota_plan_delete" ON flota_plan_accion FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "flota_plan_items_read" ON flota_plan_accion_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "flota_plan_items_insert" ON flota_plan_accion_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "flota_plan_items_update" ON flota_plan_accion_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "flota_plan_items_delete" ON flota_plan_accion_items FOR DELETE TO authenticated USING (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION flota_plan_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flota_plan_updated_at
  BEFORE UPDATE ON flota_plan_accion
  FOR EACH ROW
  EXECUTE FUNCTION flota_plan_set_updated_at();

CREATE TRIGGER flota_metas_updated_at
  BEFORE UPDATE ON flota_metas
  FOR EACH ROW
  EXECUTE FUNCTION flota_plan_set_updated_at();
