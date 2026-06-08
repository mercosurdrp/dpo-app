-- =============================================
-- Herramienta de gestión: marca de contramedida completada
-- Solo relevante cuando el target es un reporte de seguridad: la contramedida
-- se vuelca al plan de acción del reporte (reporte_seguridad_planes) ÚNICAMENTE
-- cuando esta marca está en true. Mientras esté en false, no se toca el plan.
-- =============================================

ALTER TABLE plan_herramientas_gestion
  ADD COLUMN IF NOT EXISTS contramedida_completada BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN plan_herramientas_gestion.contramedida_completada IS
  'Solo aplica cuando target = reporte de seguridad: si true, la contramedida se vuelca al plan de acción del reporte.';
