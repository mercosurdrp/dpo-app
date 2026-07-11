-- =============================================
-- PIs de checklist en el tablero de Indicadores de Flota (DPO 1.3 R6/R7):
--  - checklist_deteccion: % de OTs correctivas con defecto detectado en el
--    checklist del mismo dominio en los 15 días previos (calidad del checklist).
--  - checklist_resolucion: días promedio entre el defecto observado y su
--    plan de acción resuelto, por mes de resolución.
-- Sin meta semilla: se definen desde la card (admin/supervisor).
-- =============================================

INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('checklist_deteccion', NULL, '>=', '%'),
  ('checklist_resolucion', NULL, '<=', 'días')
ON CONFLICT (kpi) DO NOTHING;
