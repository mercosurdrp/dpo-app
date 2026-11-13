-- Observaciones mensuales de un indicador, cargadas desde su página
-- (/indicadores/dqi, etc.), para dejar evidencia de los meses que no
-- cumplieron el target. Las observaciones de las reuniones siguen en
-- reuniones_indicadores_observaciones (atadas a una reunión); éstas van
-- atadas a un mes. `indicador` es una clave libre ('dqi', ...) y `periodo`
-- es 'YYYY-MM'.
CREATE TABLE IF NOT EXISTS indicadores_observaciones_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador text NOT NULL,
  periodo text NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  texto text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_indicadores_observaciones_mes_ind_periodo
  ON indicadores_observaciones_mes(indicador, periodo);

ALTER TABLE indicadores_observaciones_mes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "indicadores_obs_mes_read" ON indicadores_observaciones_mes;
CREATE POLICY "indicadores_obs_mes_read" ON indicadores_observaciones_mes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "indicadores_obs_mes_write" ON indicadores_observaciones_mes;
CREATE POLICY "indicadores_obs_mes_write" ON indicadores_observaciones_mes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

-- Control:
-- SELECT indicador, periodo, count(*) FROM indicadores_observaciones_mes GROUP BY 1, 2 ORDER BY 1, 2;
