CREATE TABLE dpo_kpis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL,
  numero integer NOT NULL CHECK (numero BETWEEN 1 AND 56),
  valor numeric,
  es_auto boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(mes, anio, numero)
);

CREATE INDEX idx_dpo_kpis_periodo ON dpo_kpis(anio, mes);

ALTER TABLE dpo_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON dpo_kpis FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON dpo_kpis FOR ALL TO service_role USING (true) WITH CHECK (true);
