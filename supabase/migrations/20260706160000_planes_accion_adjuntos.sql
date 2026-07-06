-- Adjuntos en planes de acción del presupuesto (solo Pampeana)
BEGIN;

ALTER TABLE public.presupuestos_planes_accion
  ADD COLUMN IF NOT EXISTS adjunto_urls text[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public)
VALUES ('planes-accion-presupuesto', 'planes-accion-presupuesto', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "planes_accion_storage_read" ON storage.objects;
CREATE POLICY "planes_accion_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'planes-accion-presupuesto');

DROP POLICY IF EXISTS "planes_accion_storage_insert" ON storage.objects;
CREATE POLICY "planes_accion_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'planes-accion-presupuesto');

DROP POLICY IF EXISTS "planes_accion_storage_delete" ON storage.objects;
CREATE POLICY "planes_accion_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'planes-accion-presupuesto');

COMMIT;
