-- =============================================
-- 091 · Períodos Críticos R3.4.3 — Análisis FODA (SWOT) continuo
-- =============================================
-- Cumple R3.4.3 del manual DPO (pilar Planeamiento, punto 3.4):
--   "Una vez finalizado el período crítico, el distribuidor analiza y realiza
--    cambios en el análisis SWOT del período crítico."
--
-- Modelo: FODA VIVO (documento continuo, como pide el manual). Items
-- categorizados F/O/D/A con impacto y acción recomendada (texto libre). Cada
-- item puede taggear opcionalmente de qué período crítico surgió (snapshot
-- textual — los períodos se detectan dinámicamente client-side, no hay FK).
-- "Mover un item de categoría" = UPDATE de `categoria`, que materializa el
-- espíritu del manual: pasar una Debilidad a Fortaleza, mitigar una Amenaza.
--
-- RLS sigue el patrón pc_* (mig 085): read = authenticated, write = roles
-- admin/admin_rrhh/supervisor. Idempotente. NOTIFY pgrst al final.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS pc_swot_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- F=Fortaleza · O=Oportunidad · D=Debilidad · A=Amenaza
  categoria            TEXT NOT NULL CHECK (categoria IN ('F','O','D','A')),
  texto                TEXT NOT NULL,
  impacto              TEXT NOT NULL DEFAULT 'medio'
                         CHECK (impacto IN ('alto','medio','bajo')),
  accion_recomendada   TEXT NOT NULL DEFAULT '',
  -- Tag opcional del período crítico que originó el item (snapshot textual)
  periodo_nombre       TEXT,
  periodo_anio         INT,
  periodo_fecha_inicio DATE,
  periodo_fecha_fin    DATE,
  orden                INT NOT NULL DEFAULT 0,
  activo               BOOLEAN NOT NULL DEFAULT true,
  created_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_swot_items_activo ON pc_swot_items(activo);
CREATE INDEX IF NOT EXISTS idx_pc_swot_items_anio   ON pc_swot_items(periodo_anio);

DROP TRIGGER IF EXISTS trg_pc_swot_items_updated_at ON pc_swot_items;
CREATE TRIGGER trg_pc_swot_items_updated_at
  BEFORE UPDATE ON pc_swot_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pc_swot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_swot_items_read" ON pc_swot_items;
CREATE POLICY "pc_swot_items_read"
  ON pc_swot_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pc_swot_items_write" ON pc_swot_items;
CREATE POLICY "pc_swot_items_write"
  ON pc_swot_items FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

COMMIT;

NOTIFY pgrst, 'reload schema';
