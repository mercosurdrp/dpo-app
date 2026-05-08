CREATE TABLE ventas_diarias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL,
  ds_fletero_carga text NOT NULL,
  total_bultos numeric NOT NULL DEFAULT 0,
  total_unidades numeric NOT NULL DEFAULT 0,
  total_hl numeric NOT NULL DEFAULT 0,
  viajes integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(fecha, ds_fletero_carga)
);

ALTER TABLE ventas_diarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON ventas_diarias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON ventas_diarias FOR ALL TO service_role USING (true) WITH CHECK (true);
