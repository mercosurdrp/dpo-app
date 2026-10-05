-- =============================================
-- Inversiones: Gantt plan vs real + presupuesto CAPEX del año (DPO 5.3)
-- =============================================
-- El auditor del 5.3 (3YP & CAPEX) pide ver, por inversión, si se hizo o no
-- y cuál fue lo real contra lo planificado en TIEMPO y en PRESUPUESTO.
--
-- Hasta ahora cada inversión tenía una sola fecha programada y una sola
-- fecha real (hitos). Para dibujar barras en un Gantt hace falta un inicio:
--   plan  = [fecha_inicio_programada, fecha_programada]
--   real  = [fecha_inicio_real,       fecha_realizada]
-- Los inicios son opcionales: sin inicio, la inversión se dibuja como hito.
--
-- Además, un presupuesto de CAPEX por año (cuánto hay para invertir) para
-- comparar lo comprometido y lo ejecutado contra ese tope, mes a mes.
-- =============================================

BEGIN;

ALTER TABLE presupuestos_inversiones
  ADD COLUMN IF NOT EXISTS fecha_inicio_programada date,
  ADD COLUMN IF NOT EXISTS fecha_inicio_real       date;

COMMENT ON COLUMN presupuestos_inversiones.fecha_inicio_programada IS
  'Inicio planificado del proyecto. El fin planificado es fecha_programada.';
COMMENT ON COLUMN presupuestos_inversiones.fecha_inicio_real IS
  'Inicio real del proyecto. El fin real es fecha_realizada.';

-- Dato cargado con el año mal tipeado (22026-06-25): la fecha real de la
-- inversión en celulares es el 25/06/2026.
UPDATE presupuestos_inversiones
   SET fecha_realizada = DATE '2026-06-25'
 WHERE fecha_realizada > DATE '2100-01-01'
   AND titulo = 'Inversión en celulares';

-- -----------------------------------------------
-- Presupuesto de CAPEX por año
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos_capex (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio          int  NOT NULL UNIQUE,
  monto         numeric(14,2) NOT NULL DEFAULT 0,   -- cuánto hay para invertir en el año
  observaciones text,                               -- de dónde sale el número, aprobación, etc.
  updated_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE presupuestos_capex ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presup_capex_select_auth" ON presupuestos_capex;
CREATE POLICY "presup_capex_select_auth"
  ON presupuestos_capex FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "presup_capex_write_editors" ON presupuestos_capex;
CREATE POLICY "presup_capex_write_editors"
  ON presupuestos_capex FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

GRANT ALL ON presupuestos_capex TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_presup_capex_updated_at ON presupuestos_capex;
CREATE TRIGGER trg_presup_capex_updated_at
  BEFORE UPDATE ON presupuestos_capex
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
