-- =============================================
-- 157 · Árbol del Sueño — valores mensuales de KPIs manuales
-- =============================================
-- Carga mes a mes de los KPIs de fuente manual (HS Extras, Tiempo en Ruta,
-- etc.). El valor YTD de sueno_kpi_valores se recalcula desde estos meses
-- (promedio o suma según el KPI, definido en el front: arbol-config.ts).
-- Edición: solo rol 'admin'. Lectura: cualquier autenticado.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS sueno_kpi_mensual (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key     text NOT NULL,
  anio        int  NOT NULL,
  mes         int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor       numeric NOT NULL,
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_key, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_sueno_kpi_mensual_anio ON sueno_kpi_mensual(anio);

-- RLS
ALTER TABLE sueno_kpi_mensual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sueno_kpi_mensual_select_auth" ON sueno_kpi_mensual;
CREATE POLICY "sueno_kpi_mensual_select_auth"
  ON sueno_kpi_mensual FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sueno_kpi_mensual_write_admin" ON sueno_kpi_mensual;
CREATE POLICY "sueno_kpi_mensual_write_admin"
  ON sueno_kpi_mensual FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger updated_at (función compartida update_updated_at ya existe)
DROP TRIGGER IF EXISTS trg_sueno_kpi_mensual_updated_at ON sueno_kpi_mensual;
CREATE TRIGGER trg_sueno_kpi_mensual_updated_at
  BEFORE UPDATE ON sueno_kpi_mensual
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
