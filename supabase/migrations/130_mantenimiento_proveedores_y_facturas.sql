-- 130: (1) Habilita el tipo de identificador 'proveedor' en las categorías de
-- requisitos legales (para "Documentos de Proveedores" del Tablero de mtto).
-- (2) Crea el bucket de Storage para adjuntar la factura/comprobante de cada
-- mantenimiento (Órdenes de Trabajo). Las URLs públicas se guardan en
-- mantenimiento_realizados.evidencia_urls.

-- (1) Tipo proveedor en requisitos legales
ALTER TABLE requisitos_legales_categorias
  DROP CONSTRAINT IF EXISTS requisitos_legales_categorias_tipo_identificador_check;
ALTER TABLE requisitos_legales_categorias
  ADD CONSTRAINT requisitos_legales_categorias_tipo_identificador_check
  CHECK (tipo_identificador IN ('ninguno', 'vehiculo', 'persona', 'ubicacion', 'proveedor'));

-- (2) Bucket de facturas/evidencias de mantenimiento
INSERT INTO storage.buckets (id, name, public)
VALUES ('mantenimiento-evidencias', 'mantenimiento-evidencias', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mant_evidencias_read" ON storage.objects;
CREATE POLICY "mant_evidencias_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mantenimiento-evidencias');

DROP POLICY IF EXISTS "mant_evidencias_insert" ON storage.objects;
CREATE POLICY "mant_evidencias_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mantenimiento-evidencias');

DROP POLICY IF EXISTS "mant_evidencias_update" ON storage.objects;
CREATE POLICY "mant_evidencias_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'mantenimiento-evidencias');

DROP POLICY IF EXISTS "mant_evidencias_delete" ON storage.objects;
CREATE POLICY "mant_evidencias_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mantenimiento-evidencias'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                AND role::text = ANY (ARRAY['admin', 'supervisor']))
  );
