-- =============================================
-- Conteos físicos de stock de repuestos (DPO Flota 2.3 R2/R3):
-- sesión de recuento con el stock del sistema congelado al momento del conteo,
-- diferencia por ítem y ajuste opcional del stock. KPI inventario_exactitud
-- (% de ítems sin diferencia, por mes) en el tablero de Indicadores.
-- =============================================

CREATE TABLE mantenimiento_conteos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  realizado_por TEXT NOT NULL,
  observaciones TEXT,
  ajustado BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mantenimiento_conteo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conteo_id UUID NOT NULL REFERENCES mantenimiento_conteos(id) ON DELETE CASCADE,
  repuesto_id UUID NOT NULL REFERENCES mantenimiento_repuestos(id) ON DELETE CASCADE,
  stock_sistema NUMERIC NOT NULL,
  stock_contado NUMERIC NOT NULL
);

CREATE INDEX idx_mtto_conteos_fecha ON mantenimiento_conteos(fecha DESC);
CREATE INDEX idx_mtto_conteo_items_conteo ON mantenimiento_conteo_items(conteo_id);

ALTER TABLE mantenimiento_conteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantenimiento_conteo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mtto_conteos_read" ON mantenimiento_conteos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mtto_conteos_insert" ON mantenimiento_conteos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mtto_conteos_delete" ON mantenimiento_conteos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "mtto_conteo_items_read" ON mantenimiento_conteo_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mtto_conteo_items_insert" ON mantenimiento_conteo_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mtto_conteo_items_delete" ON mantenimiento_conteo_items
  FOR DELETE TO authenticated USING (true);

INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('inventario_exactitud', NULL, '>=', '%')
ON CONFLICT (kpi) DO NOTHING;
