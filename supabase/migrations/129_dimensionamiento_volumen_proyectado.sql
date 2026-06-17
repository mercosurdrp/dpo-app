-- 129: Dimensionamiento de Dotación — volumen proyectado mes a mes (DPO 3.1) — SOLO Pampeana
-- Proyección de demanda para anticipar refuerzo/horas extra: HL por mes del presupuesto anual
-- (hoja "PRESUPUESTO 2026 MRP" → "Total en HL"). El módulo escala los recursos necesarios por
-- el índice hl_mes / hl_mes_actual y los compara con la dotación actual fija.

begin;

CREATE TABLE IF NOT EXISTS dim_volumen_proyectado (
  anio       integer NOT NULL,
  mes        integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  hl         numeric NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes)
);

ALTER TABLE dim_volumen_proyectado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dim_volproy_select_auth ON dim_volumen_proyectado;
CREATE POLICY dim_volproy_select_auth ON dim_volumen_proyectado FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dim_volproy_write ON dim_volumen_proyectado;
CREATE POLICY dim_volproy_write ON dim_volumen_proyectado FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::user_role,'supervisor'::user_role,'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::user_role,'supervisor'::user_role,'admin_rrhh'::user_role])));

-- Seed presupuesto 2026 (Total en HL por mes).
INSERT INTO dim_volumen_proyectado (anio, mes, hl) VALUES
  (2026, 1, 12764.5), (2026, 2, 11759.2), (2026, 3, 9190.4), (2026, 4, 9157.1),
  (2026, 5, 10611.9), (2026, 6, 7065.2),  (2026, 7, 9706.2), (2026, 8, 9376.9),
  (2026, 9, 9886.4),  (2026, 10, 11303.4), (2026, 11, 11279.1), (2026, 12, 15986.6)
ON CONFLICT (anio, mes) DO NOTHING;

commit;
