-- Acciones comerciales por reunión (Ventas-Logística): slides/fotos que pasa
-- Ventas y se suben como imagen para hablarlas en la reunión. Las imágenes van
-- al bucket privado "reuniones" (path acciones-comerciales/<reunion_id>/...),
-- se muestran con URL firmada.
CREATE TABLE IF NOT EXISTS reunion_acciones_comerciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  foto_path text NOT NULL,
  foto_nombre text,
  descripcion text,
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acciones_comerciales_reunion ON reunion_acciones_comerciales(reunion_id);

ALTER TABLE reunion_acciones_comerciales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_com_read" ON reunion_acciones_comerciales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "acc_com_write" ON reunion_acciones_comerciales
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
