-- =============================================
-- Árbol del Sueño: TQI y FGLI pasan a MERMA FINAL (HL perdidos de verdad)
-- (definición de Sebastián, 2026-09-14, tercera vuelta del día):
--
--   "el wqi y el dqi contemplan lo que entra a reempaque, por eso son valores
--    altos. TQI tiene solo HL perdidos por rotura, que es lo que realmente se
--    rompe. Y FGLI lo mismo: solo HL perdidos por roturas, obsolescencia y
--    diferencia de inventario."
--
--   TQI  = HL rotos descartados (almacén + distribución) ÷ HL entregados × 1M
--   FGLI = (HL rotos + vencidos + diferencia neta de inventario) ÷ HL entr. × 1M
--   WQI / DQI siguen midiendo lo AFECTADO (con reempaque): no suman al TQI.
--
-- Solo cambian las METAS: los dos KPI se calculan en vivo desde la serie
-- diaria del depósito (src/lib/sueno/externos.ts). Las 2.400 / 2.500 PPM de
-- la 160000 eran para la base "WQI + DQI" y en la base nueva quedarían verdes
-- para siempre (real 2026 ene-sep: TQI 514, FGLI 605).
--
-- Metas nuevas, en PPM, del presupuesto 2026 del depósito (HL/mes de roturas y
-- de diferencias, sobre los HL entregados ene-sep): TQI 388 → 400 (gatillo
-- 520), FGLI 523 → 520 (gatillo 680). Se editan con el lápiz de la tarjeta.
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta = 400, gatillo = 520, valor_ytd = NULL, updated_at = now()
 WHERE kpi_key = 'tqi' AND meta = 2400 AND gatillo = 3100;

UPDATE sueno_kpi_valores
   SET meta = 520, gatillo = 680, valor_ytd = NULL, updated_at = now()
 WHERE kpi_key = 'fgli' AND meta = 2500 AND gatillo = 3250;

COMMIT;

-- Verificación sugerida:
-- SELECT kpi_key, anio, valor_ytd, meta, gatillo FROM sueno_kpi_valores
--  WHERE kpi_key IN ('fgli','tqi','wqi','dqi') ORDER BY anio, kpi_key;
