-- =============================================
-- Tareas CIL / ATO (DPO Flota 4.1): registro de limpieza, inspección y
-- lubricación autónomas hechas por operarios, con evidencia opcional.
-- KPI cil_tareas (# tareas del mes) en el tablero de Indicadores.
-- =============================================

CREATE TABLE mantenimiento_cil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  dominio TEXT NOT NULL,
  tarea TEXT NOT NULL CHECK (tarea IN (
    'limpieza', 'limpieza_profunda', 'inspeccion', 'lubricacion'
  )),
  descripcion TEXT,
  operario TEXT NOT NULL,
  foto_url TEXT,
  foto_path TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mtto_cil_fecha ON mantenimiento_cil(fecha DESC);
CREATE INDEX idx_mtto_cil_dominio ON mantenimiento_cil(dominio);

ALTER TABLE mantenimiento_cil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mtto_cil_read" ON mantenimiento_cil
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mtto_cil_insert" ON mantenimiento_cil
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mtto_cil_delete" ON mantenimiento_cil
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('cil_tareas', NULL, '>=', '#')
ON CONFLICT (kpi) DO NOTHING;
