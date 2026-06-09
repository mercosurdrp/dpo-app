-- Galería de fotos genérica por sección de reunión (Ventas-Logística).
-- Mismo patrón que reunion_acciones_comerciales (migr 104) pero con columna
-- `seccion` para reutilizar la tabla en varias secciones (RMD/NPS, etc.): se
-- sube una o varias fotos para analizar y se hablan en la reunión, con su
-- Action Log acotado. Las imágenes van al bucket privado "reuniones"
-- (path seccion-fotos/<seccion>/<reunion_id>/...), se muestran con URL firmada.
CREATE TABLE IF NOT EXISTS reunion_seccion_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  seccion text NOT NULL,
  foto_path text NOT NULL,
  foto_nombre text,
  descripcion text,
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reunion_seccion_fotos_reunion
  ON reunion_seccion_fotos(reunion_id, seccion);

ALTER TABLE reunion_seccion_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reunion_seccion_fotos_read" ON reunion_seccion_fotos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "reunion_seccion_fotos_write" ON reunion_seccion_fotos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
