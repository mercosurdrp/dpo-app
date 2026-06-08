-- =============================================
-- Frescura / Vencimiento — snapshot por reunión (Ventas-Logística)
-- Congela las líneas próximas a vencer del período [desde, hasta] para comparar
-- semana a semana y registrar la acción tomada. Se carga manual o por el botón
-- "Actualizar desde frescura" (endpoint externo). La reunión lee el snapshot
-- guardado (rápido), nunca consulta la fuente externa al abrir.
-- =============================================

CREATE TABLE IF NOT EXISTS reunion_frescura_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
  desde date,
  hasta date,
  total_lineas integer NOT NULL DEFAULT 0,
  total_bultos numeric NOT NULL DEFAULT 0,
  total_valorizado numeric NOT NULL DEFAULT 0,
  accion_tomada text,
  foto_path text,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','auto')),
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reunion_frescura_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES reunion_frescura_snapshots(id) ON DELETE CASCADE,
  nro_articulo text,
  descripcion text,
  vence date,
  bultos numeric NOT NULL DEFAULT 0,
  valorizado numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_frescura_items_snapshot ON reunion_frescura_items(snapshot_id);

CREATE TRIGGER trg_reunion_frescura_snapshots_updated_at
  BEFORE UPDATE ON reunion_frescura_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reunion_frescura_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_frescura_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frescura_snap_read" ON reunion_frescura_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "frescura_snap_write" ON reunion_frescura_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

CREATE POLICY "frescura_items_read" ON reunion_frescura_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "frescura_items_write" ON reunion_frescura_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
