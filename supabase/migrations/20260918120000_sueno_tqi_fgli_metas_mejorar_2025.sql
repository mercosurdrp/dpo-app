-- =============================================
-- Árbol del Sueño: metas de TQI y FGLI = mejorar el año anterior
-- (Sebastián, 2026-09-18: "tqi y fgli son bastante incumplibles")
--
-- Las metas del 17/09 (real mar-ago ponderado: TQI 1.000/1.450, FGLI
-- 1.150/1.600) eran inalcanzables para 2026: el YTD arrastra enero (4.118 /
-- 4.320 PPM) y a septiembre ya iban 147 HL rotos y 163 HL perdidos, más de
-- lo que la meta anual permitía en todo el año (~138 / ~159 HL sobre unos
-- 137.900 HL despachados).
--
-- Regla nueva = la del Reporte DPO para estos KPIs: mejorar el mismo período
-- del año anterior. Gatillo = real 2025; meta = 10 % mejor.
--
--            real 2025   meta    gatillo   real 2026 ene-sep   proy. Q4 = 2025
--   TQI        1.866     1.700    1.900         1.555              1.694
--   FGLI       2.359     2.100    2.400         1.723              1.856
--
-- YA APLICADO en Pampeana el 2026-09-18 por REST (equivale al lápiz de la
-- tarjeta); este archivo queda como registro y para Misiones si algún día
-- lleva el árbol.
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta = 1700, gatillo = 1900, updated_at = now()
 WHERE kpi_key = 'tqi' AND anio = 2026;

UPDATE sueno_kpi_valores
   SET meta = 2100, gatillo = 2400, updated_at = now()
 WHERE kpi_key = 'fgli' AND anio = 2026;

COMMIT;
