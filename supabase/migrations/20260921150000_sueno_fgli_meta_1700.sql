-- =============================================
-- Árbol del Sueño: meta del FGLI 2026 = 1.700 PPM, gatillo 1.900
-- (Sebastián, 2026-09-21: "pondría de meta 1700 y un gatillo usado a eso")
--
-- La meta del 18/09 (2.100 / 2.400 = mejorar 10 % el real 2025 de 2.359)
-- quedó holgada: el acumulado ene-sep va en 1.715 y, siguiendo al ritmo de
-- agosto (~1.026 PPM), el año cierra en ~1.500; ni repitiendo el Q4 de 2025
-- (2.146 PPM en Q4, con el pico de diciembre) se pasa de ~1.840. Enero (4.321
-- PPM, la caída de una paleta) es lo que sostiene el acumulado arriba.
--
-- Meta 1.700 exige sostener el ritmo de mayo-septiembre; gatillo 1.900 con la
-- misma proporción que TQI (1.700 / 1.900). Hoy el FGLI queda en amarillo por
-- 15 PPM y pasa a verde en cuanto octubre cierre parecido a agosto.
--
-- YA APLICADO en Pampeana el 2026-09-21 por REST; este archivo queda como
-- registro y para Misiones si algún día lleva el árbol.
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta = 1700, gatillo = 1900, updated_at = now()
 WHERE kpi_key = 'fgli' AND anio = 2026;

COMMIT;
