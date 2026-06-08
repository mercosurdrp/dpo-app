-- =============================================
-- Sobrestock — snapshot por reunión (Ventas-Logística)
-- Foto de los artículos con sobrestock (días de cobertura > umbral) en la
-- reunión, para comparar semana a semana. La acción se registra en el Action
-- Log de la sección (no hay campo aparte). Carga manual o "Actualizar desde
-- frescura" (endpoint /api/frescura/sobrestock). La reunión lee el snapshot.
-- =============================================

CREATE TABLE IF NOT EXISTS reunion_sobrestock_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
  dias_cobertura_umbral integer,
  dias_vpd integer,
  total_lineas integer NOT NULL DEFAULT 0,
  total_bultos numeric NOT NULL DEFAULT 0,
  total_valorizado numeric NOT NULL DEFAULT 0,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','auto')),
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reunion_sobrestock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES reunion_sobrestock_snapshots(id) ON DELETE CASCADE,
  nro_articulo text,
  descripcion text,
  bultos numeric NOT NULL DEFAULT 0,
  dias_cobertura numeric,
  vpd numeric,
  valorizado numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sobrestock_items_snapshot ON reunion_sobrestock_items(snapshot_id);

CREATE TRIGGER trg_reunion_sobrestock_snapshots_updated_at
  BEFORE UPDATE ON reunion_sobrestock_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reunion_sobrestock_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_sobrestock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sobrestock_snap_read" ON reunion_sobrestock_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sobrestock_snap_write" ON reunion_sobrestock_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

CREATE POLICY "sobrestock_items_read" ON reunion_sobrestock_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sobrestock_items_write" ON reunion_sobrestock_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
