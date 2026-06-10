-- =============================================
-- Avance de Venta — snapshot por reunión (Ventas-Logística)
-- Congela el acumulado de venta de la empresa (en HL) vs. el objetivo del mes:
-- objetivo, real a la fecha, tendencia (proyección a fin de mes) y % de avance,
-- a nivel total y abierto por categoría (Cervezas / UNG / Aguas).
-- Los datos NO viven en dpo-app: se traen del dashboard Mercosur (base externa)
-- con el botón "Actualizar desde dashboard" y se congelan acá para comparar
-- reunión a reunión. La reunión lee el snapshot guardado, nunca la fuente externa
-- al abrir.
-- =============================================

CREATE TABLE IF NOT EXISTS reunion_avance_venta_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
  anio integer NOT NULL,
  mes integer NOT NULL,
  desde date,                                  -- primer día del mes calculado
  hasta date,                                  -- corte del acumulado (día de la foto)
  peso_habiles numeric NOT NULL DEFAULT 0,     -- días hábiles ponderados del mes (L-V=1, S=0.5)
  peso_trabajados numeric NOT NULL DEFAULT 0,  -- días hábiles ponderados hasta el corte
  objetivo_total_hl numeric NOT NULL DEFAULT 0,
  real_total_hl numeric NOT NULL DEFAULT 0,
  tendencia_total_hl numeric NOT NULL DEFAULT 0,
  pct_avance_total numeric NOT NULL DEFAULT 0,
  objetivo_disponible boolean NOT NULL DEFAULT true,  -- false = no había objetivo cerrado en el mes
  origen text NOT NULL DEFAULT 'auto' CHECK (origen IN ('manual','auto')),
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reunion_avance_venta_detalle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES reunion_avance_venta_snapshots(id) ON DELETE CASCADE,
  categoria text NOT NULL,                     -- Cervezas / UNG / Aguas
  orden integer NOT NULL DEFAULT 0,
  objetivo_hl numeric NOT NULL DEFAULT 0,
  real_hl numeric NOT NULL DEFAULT 0,
  tendencia_hl numeric NOT NULL DEFAULT 0,
  pct_avance numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_avance_venta_detalle_snapshot
  ON reunion_avance_venta_detalle(snapshot_id);

CREATE TRIGGER trg_reunion_avance_venta_snapshots_updated_at
  BEFORE UPDATE ON reunion_avance_venta_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reunion_avance_venta_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_avance_venta_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avance_venta_snap_read" ON reunion_avance_venta_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "avance_venta_snap_write" ON reunion_avance_venta_snapshots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

CREATE POLICY "avance_venta_detalle_read" ON reunion_avance_venta_detalle
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "avance_venta_detalle_write" ON reunion_avance_venta_detalle
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
