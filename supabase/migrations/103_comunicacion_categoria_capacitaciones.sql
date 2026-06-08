-- =============================================
-- Portal del Empleado · Buzón: nueva categoría "Capacitaciones"
-- Idempotente (ADD VALUE IF NOT EXISTS). Aplicar en Misiones y Pampeana.
-- =============================================
ALTER TYPE comunicacion_categoria ADD VALUE IF NOT EXISTS 'capacitaciones';
