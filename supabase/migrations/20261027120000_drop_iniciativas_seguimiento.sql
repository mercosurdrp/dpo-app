-- Iniciativas de ahorro: se miran por mes, no por trimestre.
--
-- Los avances trimestrales (Q1-Q4) salieron de la app el 16/09/2026
-- (commit c9f5ffce): el ahorro de cada mes se calcula solo (EERR del rubro,
-- registro de combustible o Foxtrot). La tabla quedó con 3 filas viejas que
-- nadie leía; el 27/10/2026 se borraron y acá cae la tabla. La evidencia del
-- Q2 de limitadores (MERCOSUR JUL.pdf, en el bucket presupuestos) se deja
-- en el storage: es el resumen de Axion de julio, no un dato del trimestre.

DROP TABLE IF EXISTS presupuestos_iniciativas_seguimiento;
