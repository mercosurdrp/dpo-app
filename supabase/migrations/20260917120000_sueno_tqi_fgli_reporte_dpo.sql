-- =============================================
-- Árbol del Sueño: TQI y FGLI en la base del Reporte DPO 2026 (volumen afectado)
-- (Sebastián, 2026-09-17: "está bien, tiene que incluir volumen afectado")
--
-- Desde hoy el árbol lee TQI (DC-K1279) y FGLI (DC-K0030) del endpoint mensual
-- del tablero del depósito (`/api/indicadores`, bloque `dpo_base`), con la
-- definición del Reporte DPO: la rotura de almacén es el volumen AFECTADO
-- (reempaque + depósito + acarreo), las diferencias de inventario son
-- |faltantes| + |sobrantes| de la grilla DPO y NO entran los faltantes de
-- entrega. Es ~3× la merma final que se venía midiendo (TQI 511 / FGLI 600),
-- así que las metas viejas (400/520 y 520/680) quedarían rojas para siempre.
--
-- Metas = real 2026 de MARZO A AGOSTO ponderado por HL (regla del 14/09: sin
-- enero y febrero); gatillo = peor mes del tramo. En PPM, base nueva:
--
--            mar    abr    may    jun    jul    ago | mar-ago | peor
--   TQI      783  1.452    734  1.070    976  1.010 |  1.003  | 1.452
--   FGLI   1.078  1.600    873  1.151  1.113  1.048 |  1.153  | 1.600
--   (enero: 4.118 / 4.320 · febrero: 1.985 / 2.259 → afuera)
--
--   → TQI  meta 1.000, gatillo 1.450
--   → FGLI meta 1.150, gatillo 1.600
--
-- Real 2026 ene-sep: TQI 1.555, FGLI 1.723 (rojo contra la meta por enero y
-- febrero; desde marzo está adentro). 2025 completo: 1.866 / 2.359.
-- WQI (2.200/2.800) y DQI (200/300) no cambian: ya estaban en esta base.
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta = 1000, gatillo = 1450, updated_at = now()
 WHERE kpi_key = 'tqi' AND anio = 2026;

UPDATE sueno_kpi_valores
   SET meta = 1150, gatillo = 1600, updated_at = now()
 WHERE kpi_key = 'fgli' AND anio = 2026;

COMMIT;

-- Verificación sugerida:
-- SELECT kpi_key, anio, valor_ytd, meta, gatillo FROM sueno_kpi_valores
--  WHERE kpi_key IN ('fgli','tqi') ORDER BY anio, kpi_key;
