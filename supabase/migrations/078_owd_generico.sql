-- =============================================
-- 078 · OWD genérico — una plantilla de checklist por punto del manual DPO
-- =============================================
-- Generaliza el OWD (Observación en el Puesto de trabajo) que hasta ahora
-- estaba cableado al único punto "1.1 PRE RUTA" (pilar Entrega) vía la
-- columna entera `version`/`template_version` = 1.
--
-- A partir de acá, CADA punto (tabla `preguntas`) puede tener su propia
-- plantilla OWD con su checklist de ítems. La plantilla se vincula a la
-- pregunta por FK, igual que planes_accion / indicadores / evidencias.
--
-- 🔑 El id de la pregunta NO es estable entre tenants (se siembra con
--    gen_random_uuid en 003_seed_preguntas.sql). El identificador estable es
--    preguntas.key. El punto 1.1 PRE RUTA es key = '5_1_23_73'.
--    Por eso el backfill resuelve la pregunta por KEY, nunca por UUID literal.
--
-- Aditivo, seguro para ambos tenants (Pampeana + Misiones) e idempotente:
-- se puede correr más de una vez sin romper nada. RLS de escritura admin-only
-- con el patrón inline de profiles.role (017/001), sin auth_role() ni enums
-- (Misiones no los tiene). Ejecutar en el SQL Editor de cada Supabase.
-- =============================================

BEGIN;

-- Helper updated_at (por si no existiera en este tenant). Idéntico al de 001.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 1) Plantillas OWD: una por punto DPO
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS owd_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id           UUID NOT NULL UNIQUE REFERENCES preguntas(id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,
  meta_mensual          INTEGER NOT NULL DEFAULT 8,        -- objetivo de observaciones por mes
  meta_cumplimiento_pct NUMERIC(5,2) NOT NULL DEFAULT 90,  -- % de cumplimiento esperado
  activo                BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owd_templates_pregunta ON owd_templates(pregunta_id);

DROP TRIGGER IF EXISTS trg_owd_templates_updated_at ON owd_templates;
CREATE TRIGGER trg_owd_templates_updated_at
  BEFORE UPDATE ON owd_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------
-- 2) Ítems del checklist -> pertenecen a una plantilla
--    (se conserva `version` como columna legacy del 1.1)
-- ---------------------------------------------
ALTER TABLE owd_items
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES owd_templates(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_owd_items_template ON owd_items(template_id);

-- ---------------------------------------------
-- 3) Observaciones -> pertenecen a una plantilla
--    RESTRICT: no se puede borrar una plantilla con historial de observaciones
-- ---------------------------------------------
ALTER TABLE owd_observaciones
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES owd_templates(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_owd_obs_template ON owd_observaciones(template_id);

-- ---------------------------------------------
-- 4) RLS de owd_templates (lectura todos; escritura admin)
-- ---------------------------------------------
ALTER TABLE owd_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owd_templates_read" ON owd_templates;
CREATE POLICY "owd_templates_read" ON owd_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "owd_templates_admin" ON owd_templates;
CREATE POLICY "owd_templates_admin" ON owd_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT ALL ON owd_templates TO anon, authenticated, service_role;

-- ---------------------------------------------
-- 5) Backfill idempotente del 1.1 PRE RUTA (resuelto por KEY, estable en ambos tenants)
-- ---------------------------------------------

-- 5.1 · Crear (una vez) la plantilla del 1.1
INSERT INTO owd_templates (pregunta_id, nombre, descripcion, meta_mensual, meta_cumplimiento_pct)
SELECT p.id,
       'OWD Pre-Ruta',
       'Observación en el puesto de trabajo del proceso de Pre-Ruta (SOP 1.1).',
       8,
       90
FROM preguntas p
WHERE p.key = '5_1_23_73'
ON CONFLICT (pregunta_id) DO NOTHING;

-- 5.2 · Reasignar los ítems legacy (version = 1) a la plantilla del 1.1
UPDATE owd_items i
SET template_id = t.id
FROM owd_templates t
JOIN preguntas p ON p.id = t.pregunta_id
WHERE p.key = '5_1_23_73'
  AND i.version = 1
  AND i.template_id IS NULL;

-- 5.3 · Reasignar las observaciones legacy (template_version = 1) a la plantilla del 1.1
UPDATE owd_observaciones o
SET template_id = t.id
FROM owd_templates t
JOIN preguntas p ON p.id = t.pregunta_id
WHERE p.key = '5_1_23_73'
  AND o.template_version = 1
  AND o.template_id IS NULL;

COMMIT;

-- Reload del schema cache de PostgREST (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
