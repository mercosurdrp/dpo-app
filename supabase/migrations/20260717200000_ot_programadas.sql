-- Programación semanal de órdenes de trabajo (DPO Flota 2.2/2.4):
-- lo que el Supervisor de Flota planea hacerle a cada unidad (día a día /
-- semana a semana), con registro histórico y PDF imprimible para el mecánico.
CREATE TABLE IF NOT EXISTS mantenimiento_ot_programadas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio          TEXT NOT NULL REFERENCES catalogo_vehiculos(dominio) ON DELETE CASCADE,
  fecha_programada DATE NOT NULL,
  -- array JSON de strings: trabajos a realizar
  tareas           JSONB NOT NULL DEFAULT '[]'::jsonb,
  taller           TEXT NOT NULL DEFAULT '',
  notas            TEXT NOT NULL DEFAULT '',
  estado           TEXT NOT NULL DEFAULT 'planificada'
    CHECK (estado IN ('planificada','enviada','en_taller','realizada','cancelada')),
  realizado_id     UUID REFERENCES mantenimiento_realizados(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mant_ot_prog_fecha_idx
  ON mantenimiento_ot_programadas (fecha_programada);
CREATE INDEX IF NOT EXISTS mant_ot_prog_dominio_idx
  ON mantenimiento_ot_programadas (dominio, fecha_programada);

CREATE OR REPLACE FUNCTION mant_ot_prog_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_mant_ot_prog_updated_at ON mantenimiento_ot_programadas;
CREATE TRIGGER trg_mant_ot_prog_updated_at
  BEFORE UPDATE ON mantenimiento_ot_programadas
  FOR EACH ROW EXECUTE FUNCTION mant_ot_prog_set_updated_at();

ALTER TABLE mantenimiento_ot_programadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mant_ot_prog_read ON mantenimiento_ot_programadas;
CREATE POLICY mant_ot_prog_read ON mantenimiento_ot_programadas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mant_ot_prog_write ON mantenimiento_ot_programadas;
CREATE POLICY mant_ot_prog_write ON mantenimiento_ot_programadas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                 AND p.role::text = ANY (ARRAY['admin','supervisor'])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                      AND p.role::text = ANY (ARRAY['admin','supervisor'])));
