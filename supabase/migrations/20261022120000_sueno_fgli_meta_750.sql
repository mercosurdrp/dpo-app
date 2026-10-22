-- =============================================
-- Árbol del Sueño: meta del FGLI 2026 = 750 PPM, gatillo 1.050
-- (Sebastián, 2026-10-22: "iría con una meta menos exigente, quizás 750,
--  y el año que viene lo hacemos exigente")
--
-- El tablero del depósito cambió la base del FGLI: `fgli_hl` pasó de volumen
-- AFECTADO (#8 reempaque + rotura + acarreo, como el TQI) a roturas
-- DESCARTADAS (#53) + vencidos (#45) + diferencia de inventario (#6). Enero
-- 2026 baja de 55 HL de rotura a 20,7. Sebastián dio por buena la base nueva
-- ("está bien lo que hizo Esteban"), aunque el FGLI quede por debajo del TQI.
--
-- Con esa base: real 2025 = 1.057 PPM; 2026 ene-oct = 608; proyección de
-- cierre con un Q4 igual al de 2025 = ~612. La meta 1.700 / 1.900 del 21/09
-- quedó sin sentido (verde con 60 % de margen). Meta 750 = ~20 % arriba de la
-- proyección, a propósito poco exigente este año; gatillo 1.050 = real 2025
-- (si no le ganás al año pasado, rojo). Para 2027 se endurece.
--
-- YA APLICADO en Pampeana el 2026-10-22 por REST; este archivo queda como
-- registro y para Misiones si algún día lleva el árbol.
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta = 750, gatillo = 1050, updated_at = now()
 WHERE kpi_key = 'fgli' AND anio = 2026;

COMMIT;
