-- =============================================
-- 134 · Árbol del Sueño (cascadeo de KPIs)
-- =============================================
-- Tabla de valores editables por KPI/año. La topología del árbol vive en el
-- front (src/lib/sueno/arbol-config.ts); acá solo guardamos valor_ytd/meta/etc.
-- Edición: solo rol 'admin'. Lectura: cualquier autenticado.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS sueno_kpi_valores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key     text NOT NULL,
  anio        int  NOT NULL,
  valor_ytd   numeric,
  meta        numeric,
  gatillo     numeric,
  mejor_si    text NOT NULL DEFAULT 'mayor' CHECK (mejor_si IN ('mayor','menor')),
  nota        text,
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_key, anio)
);

CREATE INDEX IF NOT EXISTS idx_sueno_kpi_valores_anio ON sueno_kpi_valores(anio);

-- RLS
ALTER TABLE sueno_kpi_valores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sueno_kpi_select_auth" ON sueno_kpi_valores;
CREATE POLICY "sueno_kpi_select_auth"
  ON sueno_kpi_valores FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sueno_kpi_write_admin" ON sueno_kpi_valores;
CREATE POLICY "sueno_kpi_write_admin"
  ON sueno_kpi_valores FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger updated_at (función compartida update_updated_at ya existe)
DROP TRIGGER IF EXISTS trg_sueno_kpi_updated_at ON sueno_kpi_valores;
CREATE TRIGGER trg_sueno_kpi_updated_at
  BEFORE UPDATE ON sueno_kpi_valores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed de los 17 KPIs para el año en curso (metas del slide; valor_ytd NULL)
INSERT INTO sueno_kpi_valores (kpi_key, anio, meta, mejor_si)
SELECT v.kpi_key, EXTRACT(YEAR FROM now())::int, v.meta, v.mejor_si
FROM (VALUES
  ('tri',           1,      'menor'),
  ('vlc_hl',        10500,  'menor'),
  ('otif',          98,     'mayor'),
  ('lti',           0,      'menor'),
  ('tlp',           40,     'mayor'),
  ('wnp',           6.5,    'mayor'),
  ('in_full',       99,     'mayor'),
  ('n_incidentes',  20,     'menor'),
  ('comportamientos',100,   'mayor'),
  ('tiempo_ruta',   8,      'menor'),
  ('prod_picking',  300,    'mayor'),
  ('rechazo',       1.7,    'menor'),
  ('tiempo_pdv',    5.2,    'menor'),
  ('cantidad_pnp',  5,      'menor'),
  ('hs_extras',     5.6,    'menor'),
  ('sin_dinero',    NULL,   'menor'),
  ('cerrado',       NULL,   'menor')
) AS v(kpi_key, meta, mejor_si)
ON CONFLICT (kpi_key, anio) DO NOTHING;

COMMIT;
