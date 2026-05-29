-- =============================================
-- Plan de Acción TI (Tiempo Interno) — R1.3.x
-- Cuando el Tiempo Interno del mes queda fuera de meta (>30 min o <65% en meta),
-- el supervisor de distribución carga un plan con causa raíz y acciones.
-- Clon del patrón TML (018_tml_plan_accion.sql).
-- =============================================

CREATE TYPE plan_ti_estado AS ENUM ('abierto', 'en_progreso', 'cerrado');
CREATE TYPE plan_ti_item_estado AS ENUM ('pendiente', 'en_progreso', 'completado');

-- Cabecera del plan (1 por mes-año)
CREATE TABLE ti_plan_accion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  promedio_ti_mes INTEGER NOT NULL,
  pct_dentro_meta_mes INTEGER NOT NULL,
  causa_raiz TEXT NOT NULL,
  estado plan_ti_estado NOT NULL DEFAULT 'abierto',
  fecha_cierre DATE,
  resultado_cierre TEXT,
  evidencia_cierre_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, mes)
);

CREATE INDEX idx_ti_plan_year_mes ON ti_plan_accion(year, mes);
CREATE INDEX idx_ti_plan_estado ON ti_plan_accion(estado);

-- Ítems de acción
CREATE TABLE ti_plan_accion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES ti_plan_accion(id) ON DELETE CASCADE,
  accion TEXT NOT NULL,
  responsable TEXT NOT NULL,
  fecha_compromiso DATE NOT NULL,
  estado plan_ti_item_estado NOT NULL DEFAULT 'pendiente',
  fecha_completado DATE,
  observaciones TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ti_plan_items_plan ON ti_plan_accion_items(plan_id);

-- RLS
ALTER TABLE ti_plan_accion ENABLE ROW LEVEL SECURITY;
ALTER TABLE ti_plan_accion_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ti_plan_read" ON ti_plan_accion FOR SELECT TO authenticated USING (true);
CREATE POLICY "ti_plan_insert" ON ti_plan_accion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ti_plan_update" ON ti_plan_accion FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ti_plan_delete" ON ti_plan_accion FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "ti_plan_items_read" ON ti_plan_accion_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ti_plan_items_insert" ON ti_plan_accion_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ti_plan_items_update" ON ti_plan_accion_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ti_plan_items_delete" ON ti_plan_accion_items FOR DELETE TO authenticated USING (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION ti_plan_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ti_plan_updated_at
  BEFORE UPDATE ON ti_plan_accion
  FOR EACH ROW
  EXECUTE FUNCTION ti_plan_set_updated_at();
