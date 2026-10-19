-- =============================================
-- Curva de ventas (SCI) en la Reunión Ventas-Logística — 19/10/2026
--
-- Sebastián pidió una etapa aparte en la reunión Ventas-Logística para el SCI
-- (KPI 2 del TOR; Planeamiento 4.3 R4.3.3 "revisa el índice de la curva de
-- ventas / paradas mensualmente"; Entrega 3.1 KPI 7). La sección muestra el SCI
-- del mes cerrado contra el mismo mes del año anterior, los días que se salieron
-- de la banda (promedio + 1 desvío) con su CAUSA cargada en la reunión, el
-- reparto por día de semana y un Action Log propio (seccion = 'sci').
--
-- Esta tabla guarda la causa de cada día pico. La causa es del DÍA (un pico
-- tiene una sola explicación, se haya discutido en la reunión que sea), por eso
-- la clave es la fecha y la reunión queda sólo como referencia de dónde se cargó.
--
-- La TOR (reuniones_tor_docs, semanal y mensual) se actualizó por DML aparte el
-- 19/10/2026: KPI "SCI (Curva de ventas)", tema del temario, entrada y salida.
-- =============================================

CREATE TABLE IF NOT EXISTS sci_causas_dia (
  fecha date PRIMARY KEY,
  causa text NOT NULL,
  reunion_id uuid REFERENCES reuniones(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_sci_causas_dia_updated_at
  BEFORE UPDATE ON sci_causas_dia
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sci_causas_dia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sci_causas_dia_read" ON sci_causas_dia
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sci_causas_dia_write" ON sci_causas_dia
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
