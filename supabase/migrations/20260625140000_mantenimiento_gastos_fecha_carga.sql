-- Día de carga/subida de la factura (distinto de la fecha del comprobante).
-- Se completa al cargar; las filas previas se backfillean desde created_at.
ALTER TABLE mantenimiento_gastos ADD COLUMN IF NOT EXISTS fecha_carga date;
UPDATE mantenimiento_gastos SET fecha_carga = created_at::date WHERE fecha_carga IS NULL;
ALTER TABLE mantenimiento_gastos ALTER COLUMN fecha_carga SET DEFAULT current_date;
