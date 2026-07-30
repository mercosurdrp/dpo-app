-- =============================================
-- Árbol del Sueño — rama WNP: sale HS Extras, entran WQI y Precisión de picking
-- (pedido del usuario, 2026-07-30)
--
-- La rama de productividad del almacén pasa de medir CUÁNTAS horas de más se
-- pagan (HS Extras) a medir la CALIDAD de lo que sale del picking:
--
--   WNP (HL/HH)
--    └─ Prod Picking (Bul/HH, meta 290 — bajó de 300)
--        ├─ Precisión Picking (%, meta 99,8)
--        └─ WQI (PPM, meta 2.200)
--
-- Los dos nodos nuevos son KPI EXTERNOS: su valor y su detalle mensual salen
-- de deposito-esteban (`/api/productividad/precision-resumen` y
-- `/api/productividad/wqi-resumen`), no de esta tabla. Las filas de acá sirven
-- para la META/GATILLO (que el admin puede editar con el lápiz de la tarjeta)
-- y como fallback si el depósito no responde.
--
-- `hs_extras` NO se borra: la key sigue con su serie histórica y su endpoint
-- vivo, simplemente ya no cuelga del árbol (mismo criterio que la key
-- `comportamientos` cuando se abrió por área). La topología vive en
-- src/lib/sueno/arbol-config.ts, nunca en la base.
-- =============================================

-- ---------------------------------------------
-- 1) Filas de los dos KPI nuevos, para todos los años que ya tienen la rama
-- ---------------------------------------------
-- Precisión: meta 99,8% = la misma que la fila "Precision picking" de la
--   reunión de logística. Gatillo 99,5% (por debajo, rojo).
-- WQI: meta 2.200 PPM = constante `WQI_TARGET_PPM` del depósito. Gatillo 2.800
--   = el target anterior, así un mes entre 2.200 y 2.800 queda en amarillo y no
--   directamente en rojo (2026: ene 4.092 rojo · feb 2.421 amarillo · resto verde).
INSERT INTO sueno_kpi_valores (kpi_key, anio, valor_ytd, meta, gatillo, mejor_si)
SELECT k.key, v.anio, NULL, k.meta, k.gatillo, k.mejor_si
FROM sueno_kpi_valores v
CROSS JOIN (VALUES
  ('precision_picking', 99.8::numeric, 99.5::numeric,  'mayor'),
  ('wqi',               2200::numeric, 2800::numeric,  'menor')
) AS k(key, meta, gatillo, mejor_si)
WHERE v.kpi_key = 'prod_picking'
ON CONFLICT (kpi_key, anio) DO NOTHING;

-- ---------------------------------------------
-- 2) Meta de Prod Picking: 300 -> 290
-- ---------------------------------------------
-- 🚨 El mismo número vive en tres lugares más: `arbol-config.ts` (fallback),
-- la fila "Productividad de picking" de la reunión (`reuniones.ts`) y
-- `META_PICKING` en deposito-esteban. Si se cambia acá solo, cada pantalla
-- muestra una meta distinta (ya pasó con el WNP: 6 / 6,4 / 6,5).
UPDATE sueno_kpi_valores
SET meta = 290
WHERE kpi_key = 'prod_picking' AND anio >= 2026 AND meta = 300;
