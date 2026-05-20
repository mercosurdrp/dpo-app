-- =============================================
-- 069 · Requisitos Legales — categorías administrables desde UI
-- =============================================
-- Aflojar la policy de escritura de categorías para que admin, supervisor
-- y admin_rrhh puedan crear/editar/borrar tarjetas desde la UI nueva, y
-- aprovechar para corregir el nombre "Seguro de vida obligatorio" → "Seguros"
-- y agregar la categoría "931".
-- =============================================

BEGIN;

-- Reescribir policy de escritura sobre categorías
DROP POLICY IF EXISTS "req_legales_cats_write_admin" ON requisitos_legales_categorias;
CREATE POLICY "req_legales_cats_write_editors"
  ON requisitos_legales_categorias FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- Rename: "Seguro de vida obligatorio" → "Seguros"
UPDATE requisitos_legales_categorias
   SET nombre = 'Seguros'
 WHERE slug = 'seguro-vida';

-- Alta de "931" (orden al final, sin identificador)
INSERT INTO requisitos_legales_categorias
  (nombre, slug, tipo_identificador, identificador_label, orden) VALUES
  ('931', '931', 'ninguno', NULL, 110)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
