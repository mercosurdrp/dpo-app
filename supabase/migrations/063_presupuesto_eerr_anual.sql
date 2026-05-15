-- =============================================
-- 063 · Presupuesto · Estado de Resultado anual único
-- =============================================
-- Cambio funcional:
--   El EERR pasa de subirse mes a mes (presupuestos_mensuales) a ser
--   un único archivo por año que se va pisando, ya que internamente
--   contiene los diferentes meses.
--
--   Las tareas de análisis (presupuestos_tareas) siguen siendo por (anio, mes).
--
-- Nota: presupuestos_mensuales queda en BD pero deprecada — la UI y las
-- server actions dejan de usarla en 044+063. Si se confirma que no hay
-- datos productivos, una migración futura puede DROP TABLE.
-- =============================================

BEGIN;

-- =============================================
-- 1) Tabla EERR anual (un archivo por año, se pisa)
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_eerr_anual (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio            int  NOT NULL UNIQUE,
  archivo_url     text,
  archivo_nombre  text,
  observaciones   text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE presupuestos_eerr_anual IS
  'Estado de Resultado anual del módulo /presupuesto. Un archivo por año, se sobrescribe en cada upload. El archivo contiene los diferentes meses adentro.';

COMMENT ON TABLE presupuestos_mensuales IS
  'DEPRECADA (migración 063). Reemplazada por presupuestos_eerr_anual. No se escribe más desde la app.';


-- =============================================
-- 2) RLS
-- =============================================
ALTER TABLE presupuestos_eerr_anual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presupuestos_eerr_anual_select_auth" ON presupuestos_eerr_anual;
CREATE POLICY "presupuestos_eerr_anual_select_auth"
  ON presupuestos_eerr_anual FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presupuestos_eerr_anual_write_editors" ON presupuestos_eerr_anual;
CREATE POLICY "presupuestos_eerr_anual_write_editors"
  ON presupuestos_eerr_anual FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );


-- =============================================
-- 3) GRANTs (cache PostgREST)
-- =============================================
GRANT ALL ON presupuestos_eerr_anual TO anon, authenticated, service_role;


-- =============================================
-- 4) Trigger updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_presupuestos_eerr_anual_updated_at ON presupuestos_eerr_anual;
CREATE TRIGGER trg_presupuestos_eerr_anual_updated_at
  BEFORE UPDATE ON presupuestos_eerr_anual
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
