-- =============================================
-- 156 · Requisitos Legales — segundo archivo/foto (frente + dorso)
-- =============================================
-- Cada requisito guardaba un solo archivo. Para licencias/carnets (y cualquier
-- documento de dos caras) se agrega un segundo archivo opcional.
-- Aditiva e idempotente. Aplicada vía MCP a Pampeana y Misiones (2026-06-24).
-- =============================================

ALTER TABLE requisitos_legales
  ADD COLUMN IF NOT EXISTS archivo_url_2 text,
  ADD COLUMN IF NOT EXISTS archivo_nombre_2 text;

COMMENT ON COLUMN requisitos_legales.archivo_url_2 IS
  'Segundo archivo/foto opcional (ej. dorso de licencia o carnet).';
