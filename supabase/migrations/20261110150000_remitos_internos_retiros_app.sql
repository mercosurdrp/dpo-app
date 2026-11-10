-- Remitos internos en retiros-app (app sin login, entra con la clave anon).
-- Aditivo e idempotente. Requiere haber corrido antes APLICAR_EN_PAMPEANA_REMITOS_INTERNOS.sql.
-- Igual que rr_retiros / rr_vacios: quien tiene el link carga, edita, anula y marca descarga.
-- No se habilita borrar remitos (sólo anular); los renglones sí, para poder editar.
BEGIN;

ALTER TABLE remitos_internos ADD COLUMN IF NOT EXISTS creado_por_nombre text;
ALTER TABLE remitos_internos ADD COLUMN IF NOT EXISTS descargado_por_nombre text;

GRANT SELECT, INSERT, UPDATE ON remitos_operaciones, remitos_internos TO anon;
GRANT SELECT, INSERT, DELETE ON remitos_internos_items TO anon;

DROP POLICY IF EXISTS "remitos_operaciones_anon" ON remitos_operaciones;
CREATE POLICY "remitos_operaciones_anon" ON remitos_operaciones FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "remitos_internos_anon" ON remitos_internos;
CREATE POLICY "remitos_internos_anon" ON remitos_internos FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "remitos_internos_items_anon" ON remitos_internos_items;
CREATE POLICY "remitos_internos_items_anon" ON remitos_internos_items FOR ALL TO anon USING (true) WITH CHECK (true);

COMMIT;
