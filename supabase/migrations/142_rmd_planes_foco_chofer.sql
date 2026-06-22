-- =============================================
-- 142 · RMD · Plan de acción vinculable a un CHOFER
-- =============================================
-- Las puntuaciones RMD son de la entrega (logística), por eso un plan de
-- acción puede enfocarse en el chofer responsable. Reemplaza en la UI al foco
-- por promotor (que no aplica a RMD); foco_promotor queda para planes viejos.
--
-- Idempotente. Solo Pampeana.
-- =============================================

ALTER TABLE rmd_planes
  ADD COLUMN IF NOT EXISTS foco_chofer TEXT;

COMMENT ON COLUMN rmd_planes.foco_chofer IS
  'Chofer al que se enfoca el plan de acción de RMD (nombre, libre).';
