-- =============================================
-- RMD · Cruce con NPS — observaciones — 17/11/2026
--
-- Sebastián pidió dejar dentro de RMD el cruce «clientes que nos votaron
-- RMD detractor (1-3) o pasivo (4) y que en NPS también marcaron un motivo
-- logístico» (driver «Experiencia de entrega»), con la posibilidad de dejar
-- observaciones. El cruce se calcula en vivo (src/actions/rmd-cruce-nps.ts);
-- acá sólo se guardan las observaciones.
--
-- cod_cliente = 0 → observación general del análisis (conclusión).
-- Idempotente.
-- =============================================

CREATE TABLE IF NOT EXISTS rmd_cruce_nps_observaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_cliente bigint NOT NULL,
  texto text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rmd_cruce_nps_observaciones_cliente_idx
  ON rmd_cruce_nps_observaciones (cod_cliente);

DROP TRIGGER IF EXISTS trg_rmd_cruce_nps_observaciones_updated_at ON rmd_cruce_nps_observaciones;
CREATE TRIGGER trg_rmd_cruce_nps_observaciones_updated_at
  BEFORE UPDATE ON rmd_cruce_nps_observaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE rmd_cruce_nps_observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rmd_cruce_nps_observaciones_read" ON rmd_cruce_nps_observaciones;
CREATE POLICY "rmd_cruce_nps_observaciones_read"
  ON rmd_cruce_nps_observaciones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rmd_cruce_nps_observaciones_write" ON rmd_cruce_nps_observaciones;
CREATE POLICY "rmd_cruce_nps_observaciones_write"
  ON rmd_cruce_nps_observaciones
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor', 'admin_rrhh')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor', 'admin_rrhh')
  ));

GRANT ALL ON rmd_cruce_nps_observaciones TO authenticated, service_role;
