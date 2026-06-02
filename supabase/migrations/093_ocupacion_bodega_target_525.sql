-- =============================================
-- 093 · Ocupación de Bodega — target 450 → 525 CEq
-- =============================================
-- Unificamos el mínimo de carga del camión a 525 CEq (figura en los términos
-- del SLA Ventas-Operaciones: "6 × 525", "recargas máximo 525 CEq por ruta").
-- La pantalla de OB y el sync ya pasaron a 525 en código; acá recreamos la
-- columna generada ob_pct_target para que el % se calcule contra 525 y no 450.
--
-- Efecto en el SLA de capacidad: el día cumple si la ocupación promedio
-- (CEq/525×100) ≥ 100%, es decir, si el promedio de CEq de los camiones del
-- día alcanza el mínimo de 525 CEq.
--
-- La meta del indicador OB en la tabla `indicadores` se auto-corrige a 525 en
-- la próxima corrida del sync (updateIndicadorOB escribe meta = TARGET_CEQ).
--
-- Aditivo e idempotente. Aplica en Pampeana. Misiones no usa OB.
-- =============================================

BEGIN;

ALTER TABLE ocupacion_bodega_diaria DROP COLUMN IF EXISTS ob_pct_target;

ALTER TABLE ocupacion_bodega_diaria ADD COLUMN ob_pct_target NUMERIC(7, 2)
  GENERATED ALWAYS AS (
    CASE WHEN ceq_total > 0 THEN (ceq_total / 525.0) * 100.0 ELSE 0 END
  ) STORED;

COMMIT;

NOTIFY pgrst, 'reload schema';
