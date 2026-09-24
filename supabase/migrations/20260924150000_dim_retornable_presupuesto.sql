-- Dimensionamiento (DPO Planeamiento 2.3) — SOLO Pampeana
-- Retornables a clasificar, desde el PRESUPUESTO: viajes de acarreo de cerveza
-- retornable por mes (hoja "ACARREO PXQ mrp" del presupuesto anual, fila
-- "Q - CANTIDAD DE VIAJES → CERVEZAS CMQ Retornable") × paletas por viaje (26).
-- Paletas a clasificar por día = viajes × 26 ÷ días hábiles del mes.
-- Reemplaza los HL fijos en código de src/lib/dimensionamiento/retornable.ts
-- (que sólo tenían 2026). Pedido de Sebastián del 24/09/2026.
begin;

CREATE TABLE IF NOT EXISTS dim_retornable_presupuesto (
  anio               integer NOT NULL,
  mes                integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  viajes             numeric NOT NULL DEFAULT 0,   -- camiones de retornable presupuestados en el mes
  paletas_por_viaje  numeric NOT NULL DEFAULT 26,
  hl_por_paleta      numeric NOT NULL DEFAULT 6,   -- 156 HL/camión ÷ 26 paletas
  updated_by         uuid REFERENCES auth.users(id),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes)
);
ALTER TABLE dim_retornable_presupuesto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dim_retornable_presupuesto_select_auth" ON dim_retornable_presupuesto;
CREATE POLICY "dim_retornable_presupuesto_select_auth" ON dim_retornable_presupuesto FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "dim_retornable_presupuesto_write" ON dim_retornable_presupuesto;
CREATE POLICY "dim_retornable_presupuesto_write" ON dim_retornable_presupuesto FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::user_role,'supervisor'::user_role,'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::user_role,'supervisor'::user_role,'admin_rrhh'::user_role])));
GRANT ALL ON dim_retornable_presupuesto TO authenticated, service_role;

-- Seed 2026 (PRESUPUESTO_2026.xlsx, hoja ACARREO PXQ mrp, fila Q viajes CMQ Retornable).
INSERT INTO dim_retornable_presupuesto (anio, mes, viajes) VALUES
  (2026, 1, 36), (2026, 2, 30), (2026, 3, 22), (2026, 4, 21), (2026, 5, 28), (2026, 6, 17),
  (2026, 7, 23), (2026, 8, 23), (2026, 9, 23), (2026, 10, 28), (2026, 11, 31), (2026, 12, 38)
ON CONFLICT (anio, mes) DO NOTHING;

commit;
