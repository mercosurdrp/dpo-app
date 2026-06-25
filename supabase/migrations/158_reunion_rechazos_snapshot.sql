-- =============================================
-- Rechazos — snapshot por reunión (Ventas-Logística)
-- "Foto" del rango [desde, hasta] filtrado en la sección Rechazos: congela los
-- KPIs (% rechazo HL/bultos, HL/bultos rechazados, eventos, patentes) y la
-- tabla de rechazos por motivo, para que la reunión muestre siempre lo que se
-- discutió y se pueda comparar semana a semana. El drill-down (clientes/
-- productos/patentes) sigue consultando en vivo con el rango fijado.
-- La reunión lee el snapshot guardado; se re-fija con el botón "Fijar/Re-fijar".
-- =============================================

CREATE TABLE IF NOT EXISTS reunion_rechazos_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
  desde date,
  hasta date,
  hl_rechazados numeric NOT NULL DEFAULT 0,
  ventas_total_hl numeric NOT NULL DEFAULT 0,
  tasa numeric,
  bultos_rechazados numeric NOT NULL DEFAULT 0,
  ventas_total_bultos numeric NOT NULL DEFAULT 0,
  tasa_bultos numeric,
  eventos numeric NOT NULL DEFAULT 0,
  patentes_con_rechazo numeric NOT NULL DEFAULT 0,
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','auto')),
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reunion_rechazos_motivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES reunion_rechazos_snapshots(id) ON DELETE CASCADE,
  id_rechazo integer,
  ds_rechazo text,
  categoria text,
  hl numeric NOT NULL DEFAULT 0,
  bultos numeric NOT NULL DEFAULT 0,
  eventos numeric NOT NULL DEFAULT 0,
  orden integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rechazos_motivos_snapshot ON reunion_rechazos_motivos(snapshot_id);

CREATE TRIGGER trg_reunion_rechazos_snapshots_updated_at
  BEFORE UPDATE ON reunion_rechazos_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reunion_rechazos_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_rechazos_motivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rechazos_snap_read" ON reunion_rechazos_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rechazos_snap_write" ON reunion_rechazos_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

CREATE POLICY "rechazos_motivos_read" ON reunion_rechazos_motivos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "rechazos_motivos_write" ON reunion_rechazos_motivos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
