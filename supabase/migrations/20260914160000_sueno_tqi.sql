-- =============================================
-- Árbol del Sueño: la rama FGLI pasa a ser una cadena FGLI → TQI → WQI + DQI
-- (definición de Sebastián, 2026-09-14, misma tarde que la 20260914120000):
--
--   FGLI = TQI + pérdidas de inventario (vencidos + diferencia neta del
--          recuento). SIN faltantes de entrega: el FGLI en HL de la reunión de
--          warehouse sí los suma y es otro indicador.
--   TQI  = WQI + DQI (roturas de almacén + roturas de distribución).
--
-- Los tres son KPI EXTERNOS / derivados (src/lib/sueno/externos.ts): el valor
-- se calcula en vivo desde el depósito; estas filas guardan META / GATILLO y el
-- respaldo diario que escribe el cron `cron-fallback-kpis`.
--
-- Metas: TQI 2.400 / 3.100 (las que tenía FGLI = 2.200 + 200 y 2.800 + 300).
--        FGLI 2.500 / 3.250: TQI + ~100 PPM de inventario (presupuesto 2026 del
--        depósito: 1,03 HL/mes de diferencias sobre ~9.000 HL entregados,
--        vencidos presupuestados en 0; real 2026: marzo 141 PPM, agosto 0).
-- =============================================

BEGIN;

-- TQI hereda la meta que tenía FGLI como "WQI + DQI".
INSERT INTO sueno_kpi_valores (kpi_key, anio, valor_ytd, meta, gatillo, mejor_si)
SELECT 'tqi', v.anio, NULL, 2400, 3100, 'menor'
FROM sueno_kpi_valores v
WHERE v.kpi_key = 'fgli'
ON CONFLICT (kpi_key, anio) DO NOTHING;

-- FGLI sube por el inventario. Solo si nadie la tocó a mano desde la 120000.
UPDATE sueno_kpi_valores
   SET meta = 2500, gatillo = 3250, updated_at = now()
 WHERE kpi_key = 'fgli' AND meta = 2400 AND gatillo = 3100;

COMMIT;

-- Verificación sugerida:
-- SELECT kpi_key, anio, valor_ytd, meta, gatillo FROM sueno_kpi_valores
--  WHERE kpi_key IN ('fgli','tqi','wqi','dqi') ORDER BY anio, kpi_key;
