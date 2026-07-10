-- =============================================
-- Ficha técnica + documentación por vehículo
-- Datos maestros de cada unidad (marca, modelo, chasis, motor, etc.)
-- sincronizados desde Cloudfleet (GET /api/v1/vehicles/) y editables a mano:
-- el sync SOLO completa campos vacíos, nunca pisa lo editado en la app.
-- La foto y los documentos (cédula, seguro, VTV...) no existen en la API de
-- Cloudfleet: se cargan desde la app al bucket vehiculos-fichas.
-- =============================================

CREATE TABLE vehiculos_ficha (
  dominio TEXT PRIMARY KEY REFERENCES catalogo_vehiculos(dominio) ON DELETE CASCADE,
  cloudfleet_id INTEGER,
  marca TEXT,
  modelo TEXT,
  anio TEXT,
  color TEXT,
  tipo_unidad TEXT,
  combustible TEXT,
  combustible_aux TEXT,
  chasis TEXT,
  vin TEXT,
  motor TEXT,
  capacidad_carga TEXT,
  carroceria TEXT,
  ciudad TEXT,
  centro_costo TEXT,
  chofer_asignado TEXT,
  notas TEXT,
  foto_path TEXT,
  cf_odometro NUMERIC,
  cf_odometro_fecha TIMESTAMPTZ,
  cf_synced_at TIMESTAMPTZ,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehiculos_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominio TEXT NOT NULL REFERENCES catalogo_vehiculos(dominio) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro', -- cedula | titulo | seguro | vtv | otro
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  vencimiento DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehiculos_documentos_dominio ON vehiculos_documentos(dominio);

ALTER TABLE vehiculos_ficha ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehiculos_documentos ENABLE ROW LEVEL SECURITY;

-- Lectura interna a todos; escritura admin/supervisor (la edición además se
-- gatea en el server action con requireRole).
CREATE POLICY "vehiculos_ficha_read"
  ON vehiculos_ficha FOR SELECT TO authenticated USING (true);

CREATE POLICY "vehiculos_ficha_write"
  ON vehiculos_ficha FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "vehiculos_documentos_read"
  ON vehiculos_documentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "vehiculos_documentos_write"
  ON vehiculos_documentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

-- =============================================
-- Storage bucket para foto de la unidad + documentos (público, igual que
-- roturas-calle: se sirve con getPublicUrl)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehiculos-fichas', 'vehiculos-fichas', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "vehiculos_fichas_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehiculos-fichas');

CREATE POLICY "vehiculos_fichas_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehiculos-fichas');

CREATE POLICY "vehiculos_fichas_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehiculos-fichas');
