-- =============================================
-- 090 · OWD · Fotos de evidencia por ítem de respuesta
-- =============================================
-- Cada respuesta de un ítem de OWD (owd_respuestas) puede llevar varias
-- fotos como evidencia de lo observado. Galería: 1 fila por foto,
-- referenciando la respuesta (CASCADE al borrar observación/respuesta).
--
-- Archivos en el bucket 'owd-evidencias', prefijo
-- '{observacion_id}/{item_id}/...'. Modelado sobre
-- 070_planes_accion_avances (mismo patrón de bucket + policies).
--
-- Idempotente. NOTIFY pgrst al final fuera de transacción.
-- =============================================

BEGIN;

-- =============================================
-- a) Tabla de fotos de evidencia
-- =============================================
CREATE TABLE IF NOT EXISTS owd_respuesta_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respuesta_id UUID NOT NULL
    REFERENCES owd_respuestas(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                      -- bucket 'owd-evidencias'
  nombre TEXT,
  mime TEXT,
  bytes BIGINT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owd_resp_fotos_respuesta
  ON owd_respuesta_fotos(respuesta_id);

ALTER TABLE owd_respuesta_fotos ENABLE ROW LEVEL SECURITY;

-- SELECT / INSERT: cualquier authenticated (mismas reglas que owd_respuestas).
DROP POLICY IF EXISTS "owd_resp_fotos_read" ON owd_respuesta_fotos;
CREATE POLICY "owd_resp_fotos_read"
  ON owd_respuesta_fotos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "owd_resp_fotos_insert" ON owd_respuesta_fotos;
CREATE POLICY "owd_resp_fotos_insert"
  ON owd_respuesta_fotos FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "owd_resp_fotos_delete" ON owd_respuesta_fotos;
CREATE POLICY "owd_resp_fotos_delete"
  ON owd_respuesta_fotos FOR DELETE TO authenticated
  USING (true);

GRANT ALL ON owd_respuesta_fotos
  TO anon, authenticated, service_role;

-- =============================================
-- b) Bucket de fotos
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('owd-evidencias', 'owd-evidencias', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "owd_evidencias_storage_read" ON storage.objects;
CREATE POLICY "owd_evidencias_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'owd-evidencias');

DROP POLICY IF EXISTS "owd_evidencias_storage_insert" ON storage.objects;
CREATE POLICY "owd_evidencias_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'owd-evidencias');

DROP POLICY IF EXISTS "owd_evidencias_storage_delete" ON storage.objects;
CREATE POLICY "owd_evidencias_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'owd-evidencias');

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
