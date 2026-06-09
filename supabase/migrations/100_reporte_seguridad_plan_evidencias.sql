-- =============================================
-- Evidencia de cierre del plan de acción
-- Permite, al ejecutar/terminar un plan, registrar qué se hizo:
--   - un comentario libre (comentario_cierre en el plan)
--   - uno o varios archivos de evidencia (fotos + el archivo utilizado,
--     ej. el PPT de una capacitación).
-- Gestión sólo admin, igual que el resto del plan.
-- =============================================

ALTER TABLE reporte_seguridad_planes
  ADD COLUMN IF NOT EXISTS comentario_cierre TEXT;

CREATE TABLE IF NOT EXISTS reporte_seguridad_plan_evidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES reporte_seguridad_planes(id) ON DELETE CASCADE,
  nombre_original TEXT,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reporte_seguridad_plan_evidencias_plan
  ON reporte_seguridad_plan_evidencias(plan_id);

-- =============================================
-- RLS: lectura a todos los autenticados,
-- insert/delete sólo admin.
-- =============================================
ALTER TABLE reporte_seguridad_plan_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reporte_seguridad_plan_evidencias_read"
  ON reporte_seguridad_plan_evidencias FOR SELECT TO authenticated USING (true);

CREATE POLICY "reporte_seguridad_plan_evidencias_insert"
  ON reporte_seguridad_plan_evidencias FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "reporte_seguridad_plan_evidencias_delete"
  ON reporte_seguridad_plan_evidencias FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
