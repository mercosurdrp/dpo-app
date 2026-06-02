-- =============================================
-- 093 · Períodos Críticos R3.4.1 — Períodos de FOCO definidos por el equipo
-- =============================================
-- El manual pide identificar períodos críticos para anticipar. La detección
-- automática (sobre el año anterior) es una SUGERENCIA; esta tabla guarda los
-- períodos que el equipo DECIDE y nombra ("los llamamos nosotros"): los días /
-- semanas / meses donde van a poner el foco para el año en curso.
--
-- Un período de foco = rango de fechas + nombre propio + dónde poner el foco +
-- prioridad. `origen` guarda (texto) de qué sugerencia automática salió, si la
-- hubo. RLS patrón pc_*: read = authenticated, write = admin/admin_rrhh/superv.
-- Idempotente. NOTIFY pgrst al final.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS pc_periodos_foco (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio          INT  NOT NULL,                 -- año a anticipar (ej. 2026)
  nombre        TEXT NOT NULL,                 -- el nombre que le pone el equipo
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  foco          TEXT NOT NULL DEFAULT '',      -- dónde poner el foco / qué preparar
  prioridad     TEXT NOT NULL DEFAULT 'media'
                  CHECK (prioridad IN ('alta','media','baja')),
  origen        TEXT,                          -- nombre de la sugerencia que lo originó (opcional)
  orden         INT  NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_periodos_foco_anio ON pc_periodos_foco(anio);

DROP TRIGGER IF EXISTS trg_pc_periodos_foco_updated_at ON pc_periodos_foco;
CREATE TRIGGER trg_pc_periodos_foco_updated_at
  BEFORE UPDATE ON pc_periodos_foco
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pc_periodos_foco ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_periodos_foco_read" ON pc_periodos_foco;
CREATE POLICY "pc_periodos_foco_read"
  ON pc_periodos_foco FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pc_periodos_foco_write" ON pc_periodos_foco;
CREATE POLICY "pc_periodos_foco_write"
  ON pc_periodos_foco FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                       AND p.role IN ('admin','admin_rrhh','supervisor')));

COMMIT;

NOTIFY pgrst, 'reload schema';
