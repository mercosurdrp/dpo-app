-- Mudanza "Express a San Nicolás": pagos previstos.
-- Un gasto "a pagar" (comprometido) lleva ahora la FECHA PROBABLE DE PAGO y QUÉ se
-- paga en esa fecha: un adelanto, el saldo o el total. Con eso el presupuesto
-- muestra el calendario de pagos (cuándo y cuánto hay que tener disponible).
-- Aditiva e idempotente: no toca filas existentes.
BEGIN;

ALTER TABLE mudanza_gastos ADD COLUMN IF NOT EXISTS fecha_pago date;
ALTER TABLE mudanza_gastos ADD COLUMN IF NOT EXISTS tipo_pago text;

ALTER TABLE mudanza_gastos DROP CONSTRAINT IF EXISTS mudanza_gastos_tipo_pago_check;
ALTER TABLE mudanza_gastos
  ADD CONSTRAINT mudanza_gastos_tipo_pago_check
  CHECK (tipo_pago IS NULL OR tipo_pago IN ('adelanto', 'saldo', 'total'));

COMMENT ON COLUMN mudanza_gastos.fecha_pago IS 'Fecha probable de pago (sólo tiene sentido mientras el gasto está comprometido / a pagar).';
COMMENT ON COLUMN mudanza_gastos.tipo_pago IS 'Qué se paga: adelanto, saldo o total.';

CREATE INDEX IF NOT EXISTS mudanza_gastos_fecha_pago_idx ON mudanza_gastos(fecha_pago) WHERE estado = 'comprometido';

COMMIT;
