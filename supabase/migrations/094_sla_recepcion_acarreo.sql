-- =============================================
-- 094 · SLA #7 (alm_recepcion) — recepción de abastecimiento (acarreos).
-- Reformula el SLA sembrado: el proveedor pasa de "T1 / BSC" a
-- "Acarreo / Abastecimiento" y la descripción incorpora la ventana horaria
-- (07:00–17:00) y el compromiso de descarga (≤ 2 hs del arribo), meta ≥ 95 %.
-- Idempotente: solo actualiza la fila predefinida por su código.
-- =============================================

BEGIN;

UPDATE slas
SET
  nombre = 'SLA de recepción de abastecimiento (acarreos)',
  parte_proveedor = 'Acarreo / Abastecimiento',
  descripcion = 'Acuerdo entre Almacén y Acarreo / Abastecimiento: ventana de recepción de camiones de 07:00 a 17:00 hs y descarga dentro de las 2 horas posteriores al arribo. Objetivo de cumplimiento mensual ≥ 95 %.'
WHERE codigo = 'alm_recepcion';

COMMIT;
