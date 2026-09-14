-- =============================================
-- Árbol del Sueño: metas de TQI y FGLI sin enero y febrero
-- (Sebastián, 2026-09-14: "enero y febrero tira muy para arriba el cálculo")
--
-- Meta = real 2026 de MARZO A AGOSTO (meses cerrados), ponderado por HL
-- entregados; gatillo = el peor mes de ese tramo. Base merma final (misma que
-- la 180000). En PPM:
--
--            mar   abr   may   jun   jul   ago | mar-ago | peor
--   TQI      295   365   248   365   244   241 |   295   | 365
--   FGLI     437   471   344   440   409   241 |   397   | 471
--   (enero: TQI 1.469 / FGLI 1.486 · febrero: 715 / 826 → afuera)
--
--   → TQI  meta 300, gatillo 370
--   → FGLI meta 400, gatillo 480
--
-- El YTD sigue incluyendo enero y febrero (es el real del año), así que
-- contra estas metas 2026 queda rojo: TQI 514, FGLI 605. La lectura mes a mes
-- del modal muestra que desde marzo se está dentro de la meta.
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta = 300, gatillo = 370, updated_at = now()
 WHERE kpi_key = 'tqi' AND meta = 400 AND gatillo = 520;

UPDATE sueno_kpi_valores
   SET meta = 400, gatillo = 480, updated_at = now()
 WHERE kpi_key = 'fgli' AND meta = 520 AND gatillo = 680;

COMMIT;

-- Verificación sugerida:
-- SELECT kpi_key, anio, valor_ytd, meta, gatillo FROM sueno_kpi_valores
--  WHERE kpi_key IN ('fgli','tqi') ORDER BY anio, kpi_key;
