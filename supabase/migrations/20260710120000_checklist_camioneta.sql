-- =============================================
-- Checklist básico de CAMIONETAS (AF199RD / AF199RE, depósito)
-- Set corto (distinto al de camiones): estado de carrocería y luces.
-- Km, conductor, observación y foto van en la cabecera del checklist.
-- Es un control único del día (sin salida/entrada por hora), pensado para
-- empezar a tener registro de km de las camionetas.
-- =============================================

-- Foto opcional adjunta al checklist (storage path en el bucket
-- checklist-vehiculos). La sube el cliente comprimida, directo al bucket.
ALTER TABLE checklist_vehiculos
  ADD COLUMN IF NOT EXISTS foto_path TEXT;

-- SEED: ítems del checklist de camioneta (idempotente)
INSERT INTO checklist_items (categoria, nombre, descripcion, critico, tipo_respuesta, orden, tipo_vehiculo)
SELECT v.categoria, v.nombre, v.descripcion, v.critico, v.tipo_respuesta::tipo_respuesta_checklist, v.orden, 'camioneta'::vehiculo_tipo
FROM (VALUES
  ('CARROCERÍA', 'Estado de carrocería', 'Choques, rayones o daños visibles', false, 'bueno_regular_malo', 1),
  ('LUCES', 'Estado de luces', 'Delanteras, traseras, giros, balizas y freno', false, 'bueno_regular_malo', 2)
) AS v(categoria, nombre, descripcion, critico, tipo_respuesta, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM checklist_items WHERE tipo_vehiculo = 'camioneta'
);

-- =============================================
-- Storage bucket para las fotos del checklist (público, igual que
-- roturas-calle: se sirve con getPublicUrl)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('checklist-vehiculos', 'checklist-vehiculos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "checklist_vehiculos_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-vehiculos');

CREATE POLICY "checklist_vehiculos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-vehiculos');

CREATE POLICY "checklist_vehiculos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-vehiculos');
