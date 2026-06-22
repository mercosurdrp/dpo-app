-- =============================================
-- Roturas en la calle (distribución / ruta)
-- Reportadas por el chofer desde la app: SKU(s) roto(s), motivo, foto, patente.
-- Se ven en el DQI (registro) y en la matinal de logística (con plan de acción).
-- Solo Pampeana.
-- Patrón calcado de reportes_seguridad (025) + reporte_seguridad_planes (031).
-- =============================================

-- =============================================
-- Enum de motivo
-- =============================================
CREATE TYPE rotura_motivo AS ENUM (
  'manipulacion',
  'transporte',
  'carga_descarga',
  'mal_estado_previo',
  'accidente_vial',
  'otro'
);

-- =============================================
-- Cabecera del evento de rotura
-- =============================================
CREATE TABLE roturas_calle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  hora TIME,
  patente TEXT NOT NULL,
  chofer_nombre TEXT,
  motivo rotura_motivo NOT NULL,
  observaciones TEXT,
  localidad TEXT,
  estado TEXT NOT NULL DEFAULT 'reportada',  -- reportada / en_revision / cerrada
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roturas_calle_fecha ON roturas_calle(fecha DESC);
CREATE INDEX idx_roturas_calle_creado_por ON roturas_calle(creado_por);
CREATE INDEX idx_roturas_calle_created_at ON roturas_calle(created_at DESC);

CREATE TRIGGER trg_roturas_calle_updated_at
  BEFORE UPDATE ON roturas_calle
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Líneas de SKU rotos (varios por reporte)
-- =============================================
CREATE TABLE roturas_calle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotura_id UUID NOT NULL REFERENCES roturas_calle(id) ON DELETE CASCADE,
  id_articulo INTEGER REFERENCES chess_articulos(id_articulo),
  des_articulo TEXT,
  cantidad NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roturas_calle_items_rotura ON roturas_calle_items(rotura_id);

-- =============================================
-- Adjuntos (fotos del evento)
-- =============================================
CREATE TABLE roturas_calle_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotura_id UUID NOT NULL REFERENCES roturas_calle(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roturas_calle_adjuntos_rotura ON roturas_calle_adjuntos(rotura_id);

-- =============================================
-- Plan de acción (1:1 con la rotura) — matinal de logística
-- =============================================
CREATE TABLE roturas_calle_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotura_id UUID NOT NULL UNIQUE REFERENCES roturas_calle(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable TEXT,
  fecha_planificada DATE,
  fecha_completado TIMESTAMPTZ,
  comentario_cierre TEXT,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roturas_calle_planes_rotura ON roturas_calle_planes(rotura_id);

CREATE TRIGGER trg_roturas_calle_planes_updated_at
  BEFORE UPDATE ON roturas_calle_planes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Storage bucket (público, igual que reportes-seguridad: se sirve con getPublicUrl)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('roturas-calle', 'roturas-calle', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "roturas_calle_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'roturas-calle');

CREATE POLICY "roturas_calle_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'roturas-calle');

CREATE POLICY "roturas_calle_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'roturas-calle');

CREATE POLICY "roturas_calle_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'roturas-calle'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- RLS
-- =============================================
ALTER TABLE roturas_calle ENABLE ROW LEVEL SECURITY;
ALTER TABLE roturas_calle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE roturas_calle_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE roturas_calle_planes ENABLE ROW LEVEL SECURITY;

-- Cabecera: lectura interna a todos; cada uno crea las suyas; update/delete admin
CREATE POLICY "roturas_calle_read"
  ON roturas_calle FOR SELECT TO authenticated USING (true);

CREATE POLICY "roturas_calle_insert"
  ON roturas_calle FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

CREATE POLICY "roturas_calle_update"
  ON roturas_calle FOR UPDATE TO authenticated
  USING (
    creado_por = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );

CREATE POLICY "roturas_calle_delete"
  ON roturas_calle FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Items: lectura interna; insert por dueño de la rotura o admin; delete dueño/admin
CREATE POLICY "roturas_calle_items_read"
  ON roturas_calle_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "roturas_calle_items_insert"
  ON roturas_calle_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roturas_calle r
      WHERE r.id = roturas_calle_items.rotura_id
        AND r.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "roturas_calle_items_delete"
  ON roturas_calle_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM roturas_calle r
      WHERE r.id = roturas_calle_items.rotura_id
        AND r.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Adjuntos: lectura interna; insert por dueño o admin; delete admin
CREATE POLICY "roturas_calle_adjuntos_read"
  ON roturas_calle_adjuntos FOR SELECT TO authenticated USING (true);

CREATE POLICY "roturas_calle_adjuntos_insert"
  ON roturas_calle_adjuntos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roturas_calle r
      WHERE r.id = roturas_calle_adjuntos.rotura_id
        AND r.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "roturas_calle_adjuntos_delete"
  ON roturas_calle_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Planes: lectura interna; escritura admin/supervisor (gestión en la matinal)
CREATE POLICY "roturas_calle_planes_read"
  ON roturas_calle_planes FOR SELECT TO authenticated USING (true);

CREATE POLICY "roturas_calle_planes_insert"
  ON roturas_calle_planes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "roturas_calle_planes_update"
  ON roturas_calle_planes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "roturas_calle_planes_delete"
  ON roturas_calle_planes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
