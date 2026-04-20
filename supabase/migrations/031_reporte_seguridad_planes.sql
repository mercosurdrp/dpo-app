-- =============================================
-- Plan de acción por reporte de seguridad
-- Uno por reporte. Guarda cómo se aborda el acto/condición insegura,
-- fecha planificada de resolución y cuándo quedó terminada.
-- =============================================

CREATE TABLE reporte_seguridad_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id UUID NOT NULL UNIQUE REFERENCES reportes_seguridad(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  foto_path TEXT,
  fecha_planificada DATE,
  fecha_completado TIMESTAMPTZ,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reporte_seguridad_planes_reporte ON reporte_seguridad_planes(reporte_id);

CREATE TRIGGER trg_reporte_seguridad_planes_updated_at
  BEFORE UPDATE ON reporte_seguridad_planes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS: lectura a todos los autenticados,
-- insert/update/delete sólo admin.
-- =============================================
ALTER TABLE reporte_seguridad_planes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reporte_seguridad_planes_read"
  ON reporte_seguridad_planes FOR SELECT TO authenticated USING (true);

CREATE POLICY "reporte_seguridad_planes_insert"
  ON reporte_seguridad_planes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "reporte_seguridad_planes_update"
  ON reporte_seguridad_planes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "reporte_seguridad_planes_delete"
  ON reporte_seguridad_planes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
