-- =============================================
-- 5S — Vincular auditorías con empleados (ayudante y chofer)
-- El programa 5S de flota se mide por persona, principalmente al ayudante.
-- Mantenemos los textos como fallback.
-- =============================================

ALTER TABLE s5_auditorias
  ADD COLUMN IF NOT EXISTS ayudante_id UUID REFERENCES empleados(id) ON DELETE SET NULL;

ALTER TABLE s5_auditorias
  ADD COLUMN IF NOT EXISTS chofer_id UUID REFERENCES empleados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_s5_auditorias_ayudante ON s5_auditorias(ayudante_id);
CREATE INDEX IF NOT EXISTS idx_s5_auditorias_chofer ON s5_auditorias(chofer_id);
