-- Los responsables de acciones 5S no podían responder con foto:
-- la política de INSERT del bucket s5-auditorias solo dejaba subir
-- a admin/auditor (creada a mano en el dashboard, sin migración),
-- y en Misiones no existía ninguna. La server action y la RLS de
-- s5_acciones_evidencias sí autorizaban al responsable, pero el
-- upload client-side al bucket fallaba antes.
--
-- Nueva política: admin/auditor suben cualquier path del bucket;
-- el responsable o creador de una acción puede subir solo bajo
-- la carpeta de su acción (acciones/{accion_id}/...).

DROP POLICY IF EXISTS "s5_auditorias_insert" ON storage.objects;

CREATE POLICY "s5_auditorias_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 's5-auditorias'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'auditor')
      )
      OR (
        (storage.foldername(name))[1] = 'acciones'
        AND EXISTS (
          SELECT 1 FROM s5_acciones a
          WHERE a.id::text = (storage.foldername(name))[2]
            AND (a.responsable_id = auth.uid() OR a.creado_por = auth.uid())
        )
      )
    )
  );
