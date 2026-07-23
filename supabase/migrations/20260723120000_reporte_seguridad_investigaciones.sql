-- =============================================
-- Investigación de accidentes / incidentes
-- Documentos (PDF u otros) con el informe de investigación de un reporte
-- de seguridad de tipo accidente o incidente.
-- Varios documentos por reporte (informe, anexos, revisiones).
-- Carga/borrado: sólo admin. Lectura: cualquier usuario autenticado.
-- =============================================

CREATE TABLE IF NOT EXISTS reporte_seguridad_investigaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id UUID NOT NULL REFERENCES reportes_seguridad(id) ON DELETE CASCADE,
  titulo TEXT,
  nombre_original TEXT,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  "tamaño_bytes" BIGINT NOT NULL,
  fecha_investigacion DATE,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reporte_seguridad_investigaciones_reporte
  ON reporte_seguridad_investigaciones(reporte_id);

ALTER TABLE reporte_seguridad_investigaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporte_seguridad_investigaciones_read"
  ON reporte_seguridad_investigaciones;
CREATE POLICY "reporte_seguridad_investigaciones_read"
  ON reporte_seguridad_investigaciones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reporte_seguridad_investigaciones_insert"
  ON reporte_seguridad_investigaciones;
CREATE POLICY "reporte_seguridad_investigaciones_insert"
  ON reporte_seguridad_investigaciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "reporte_seguridad_investigaciones_update"
  ON reporte_seguridad_investigaciones;
CREATE POLICY "reporte_seguridad_investigaciones_update"
  ON reporte_seguridad_investigaciones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "reporte_seguridad_investigaciones_delete"
  ON reporte_seguridad_investigaciones;
CREATE POLICY "reporte_seguridad_investigaciones_delete"
  ON reporte_seguridad_investigaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
