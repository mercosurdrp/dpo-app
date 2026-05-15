-- =============================================================
-- 065 — rechazos: fecha_venta (imputación al día de la venta)
-- =============================================================
-- Los rechazos son documentos de devolución (DVVTA / PRDVO) que se cargan
-- en Chess 1-3 días DESPUÉS de la venta. `rechazos.fecha` es la fecha del
-- comprobante de devolución, no la de la venta — eso descalza el % diario
-- (numerador y denominador en días distintos).
--
-- `fecha_venta` imputa el rechazo al día de la venta original:
--   - DVVTA: fechaComprobanteRela (fecha de la FCVTA relacionada).
--   - PRDVO: su propia fecha (no tiene desfasaje: comprobante = entrega).
--
-- El dashboard pasa a agrupar/filtrar por fecha_venta. `fecha` se conserva
-- como fecha de carga de la devolución (auditoría).
--
-- Idempotente. Aplicar en AMBOS tenants (código compartido).

ALTER TABLE rechazos
  ADD COLUMN IF NOT EXISTS fecha_venta DATE;

COMMENT ON COLUMN rechazos.fecha_venta IS
  'Fecha de la venta original que el rechazo reversa (DVVTA: fechaComprobanteRela; PRDVO: = fecha). El dashboard agrupa por esta columna.';

CREATE INDEX IF NOT EXISTS idx_rechazos_fecha_venta ON rechazos(fecha_venta);
