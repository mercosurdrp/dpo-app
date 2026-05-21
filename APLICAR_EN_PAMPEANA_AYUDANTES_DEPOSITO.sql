-- =============================================
-- APLICAR SOLO EN PAMPEANA (dpo-app-self) — SQL Editor de Supabase.
-- Ranking de ayudantes de DEPÓSITO (bimestral): config editable + premios.
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS). Es seguro re-correrlo.
-- NO aplicar en Misiones: la página se gatea con IS_MISIONES.
-- =============================================

CREATE TABLE IF NOT EXISTS s5_ayudantes_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  peso_errores NUMERIC NOT NULL DEFAULT 0.60,
  peso_5s NUMERIC NOT NULL DEFAULT 0.40,
  peso_productividad NUMERIC NOT NULL DEFAULT 0.00,
  tope_errores NUMERIC NOT NULL DEFAULT 50,    -- cant. de errores HUMANOS en la ventana = 0 puntos
  prod_target NUMERIC NOT NULL DEFAULT 300,     -- bul/HH = 100 puntos
  meses_ventana INT NOT NULL DEFAULT 2 CHECK (meses_ventana BETWEEN 1 AND 6),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

INSERT INTO s5_ayudantes_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS s5_ayudantes_premios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_desde DATE NOT NULL,              -- primer mes del bimestre (día 01)
  area TEXT NOT NULL CHECK (area IN ('deposito','distribucion')),
  posicion INT NOT NULL CHECK (posicion BETWEEN 1 AND 3),
  empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  score NUMERIC,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('auto','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (periodo_desde, area, posicion)
);

CREATE INDEX IF NOT EXISTS idx_s5_ayud_premios_periodo
  ON s5_ayudantes_premios(periodo_desde);

DROP TRIGGER IF EXISTS trg_s5_ayud_config_updated_at ON s5_ayudantes_config;
CREATE TRIGGER trg_s5_ayud_config_updated_at
  BEFORE UPDATE ON s5_ayudantes_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_s5_ayud_premios_updated_at ON s5_ayudantes_premios;
CREATE TRIGGER trg_s5_ayud_premios_updated_at
  BEFORE UPDATE ON s5_ayudantes_premios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_ayudantes_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE s5_ayudantes_premios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "s5_ayud_config_read" ON s5_ayudantes_config;
CREATE POLICY "s5_ayud_config_read"
  ON s5_ayudantes_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "s5_ayud_config_write" ON s5_ayudantes_config;
CREATE POLICY "s5_ayud_config_write"
  ON s5_ayudantes_config FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor'))
  );

DROP POLICY IF EXISTS "s5_ayud_premios_read" ON s5_ayudantes_premios;
CREATE POLICY "s5_ayud_premios_read"
  ON s5_ayudantes_premios FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "s5_ayud_premios_write" ON s5_ayudantes_premios;
CREATE POLICY "s5_ayud_premios_write"
  ON s5_ayudantes_premios FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor'))
  );
