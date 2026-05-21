-- =============================================
-- 075 · Clasificación de envases (productividad de depósito)
-- =============================================
-- Cada fila = UNA carga del operador. Mide la productividad de la TAREA
-- (no por persona): throughput (cajones/pallets por hora) y % de rotura.
-- El operador carga el TOTAL a clasificar + los rotos; los clasificados se
-- derivan (clasificados = total - rotos). `creado_por` se guarda solo para
-- trazabilidad, no para segmentar la productividad.
--
-- Aplicar SOLO en la Supabase de Pampeana (dpo-app-self). La feature es de
-- Depósito Esteban (Pampeana); el código se gatea con IS_MISIONES para que en
-- el deploy compartido de Misiones nunca consulte esta tabla (no crearla allá).
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS clasificacion_envases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  pallets_total INT NOT NULL DEFAULT 0 CHECK (pallets_total >= 0),
  pallets_rotos INT NOT NULL DEFAULT 0 CHECK (pallets_rotos >= 0),
  cajones_total INT NOT NULL DEFAULT 0 CHECK (cajones_total >= 0),
  cajones_rotos INT NOT NULL DEFAULT 0 CHECK (cajones_rotos >= 0),
  botellas_rotas INT NOT NULL DEFAULT 0 CHECK (botellas_rotas >= 0),
  notas TEXT,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- los rotos no pueden superar el total declarado
  CONSTRAINT clasif_envases_pallets_rotos_ok CHECK (pallets_rotos <= pallets_total),
  CONSTRAINT clasif_envases_cajones_rotos_ok CHECK (cajones_rotos <= cajones_total)
);

CREATE INDEX IF NOT EXISTS idx_clasif_envases_fecha
  ON clasificacion_envases(fecha);

DROP TRIGGER IF EXISTS trg_clasif_envases_updated_at ON clasificacion_envases;
CREATE TRIGGER trg_clasif_envases_updated_at
  BEFORE UPDATE ON clasificacion_envases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE clasificacion_envases ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado.
DROP POLICY IF EXISTS "clasif_envases_read" ON clasificacion_envases;
CREATE POLICY "clasif_envases_read"
  ON clasificacion_envases FOR SELECT TO authenticated USING (true);

-- Alta: cualquier autenticado (todos los operadores, incluido auditor).
-- Obliga a que la fila quede a nombre del usuario que la crea.
DROP POLICY IF EXISTS "clasif_envases_insert" ON clasificacion_envases;
CREATE POLICY "clasif_envases_insert"
  ON clasificacion_envases FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

-- Editar: el propio autor o admin/auditor.
DROP POLICY IF EXISTS "clasif_envases_update" ON clasificacion_envases;
CREATE POLICY "clasif_envases_update"
  ON clasificacion_envases FOR UPDATE TO authenticated
  USING (
    creado_por = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p
               WHERE p.id = auth.uid() AND p.role IN ('admin','auditor'))
  );

-- Borrar: el propio autor o admin/auditor.
DROP POLICY IF EXISTS "clasif_envases_delete" ON clasificacion_envases;
CREATE POLICY "clasif_envases_delete"
  ON clasificacion_envases FOR DELETE TO authenticated
  USING (
    creado_por = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p
               WHERE p.id = auth.uid() AND p.role IN ('admin','auditor'))
  );

COMMIT;
