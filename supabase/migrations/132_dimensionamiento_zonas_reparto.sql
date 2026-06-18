-- 132: Dimensionamiento — zonas de reparto (cobertura geográfica de flota) — SOLO Pampeana
-- La flota se dimensiona por zona: cada zona toma su parte del volumen (peso) y tiene un mínimo de
-- camiones por distancia/dispersión. Camiones por zona = máx(mínimo, volumen×peso ÷ capacidad);
-- total = suma de zonas. Pesos editables (estimados de ventas; ruteo_cierres solo trae Pergamino/Ramallo).

begin;

CREATE TABLE IF NOT EXISTS dim_zonas_reparto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zona             text NOT NULL,
  peso             numeric NOT NULL DEFAULT 0,    -- fracción del volumen diario (0–1)
  camiones_minimos integer NOT NULL DEFAULT 1,    -- piso de cobertura por distancia
  orden            integer NOT NULL DEFAULT 0,
  updated_by       uuid REFERENCES auth.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dim_zonas_reparto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dim_zonas_select_auth ON dim_zonas_reparto;
CREATE POLICY dim_zonas_select_auth ON dim_zonas_reparto FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dim_zonas_write ON dim_zonas_reparto;
CREATE POLICY dim_zonas_write ON dim_zonas_reparto FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::user_role,'supervisor'::user_role,'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::user_role,'supervisor'::user_role,'admin_rrhh'::user_role])));

INSERT INTO dim_zonas_reparto (zona, peso, camiones_minimos, orden) VALUES
  ('Pergamino', 0.25, 2, 1),
  ('Ramallo / Villa Ramallo', 0.20, 1, 2),
  ('Colón', 0.10, 1, 3),
  ('Arrecifes', 0.05, 1, 4),
  ('San Nicolás', 0.40, 3, 5)
ON CONFLICT DO NOTHING;

commit;
