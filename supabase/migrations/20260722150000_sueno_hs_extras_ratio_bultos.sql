-- =============================================
-- HS Extras del árbol del Sueño: pasa a ratio por bultos vendidos
-- =============================================
-- El nodo `hs_extras` medía HORAS ABSOLUTAS (valor_ytd 85,58 = promedio de los
-- meses cargados a mano) y no tenía meta. Pasa a medir horas extras cada 1.000
-- bultos vendidos, con meta 1,5.
--
-- El valor ya no se carga a mano: lo calcula el depósito
-- (deposito-esteban /api/productividad/hs-extras-resumen) como
-- Σ horas extras (indicador DPO #39) ÷ Σ bultos entregados de Chess × 1.000,
-- y dpo-app lo consume como KPI externo. Por eso se limpia `valor_ytd`: si el
-- depósito no responde, es preferible que la card quede vacía a que muestre las
-- horas absolutas viejas leídas como si fueran el ratio nuevo (85,58 contra una
-- meta de 1,5 pintaría un rojo que no significa nada).
--
-- Las filas de `sueno_kpi_mensual` con las horas absolutas NO se borran: quedan
-- como histórico de lo que se cargó a mano hasta julio 2026. Ya no las lee
-- nadie (`hs_extras` salió de KPI_AGREGACION_MENSUAL en el front).
-- =============================================

BEGIN;

UPDATE sueno_kpi_valores
   SET meta       = 1.5,
       valor_ytd  = NULL,
       mejor_si   = 'menor',
       updated_at = now()
 WHERE kpi_key = 'hs_extras';

-- Por si el año todavía no tenía fila.
INSERT INTO sueno_kpi_valores (kpi_key, anio, meta, mejor_si)
SELECT 'hs_extras', EXTRACT(YEAR FROM now())::int, 1.5, 'menor'
 WHERE NOT EXISTS (
   SELECT 1 FROM sueno_kpi_valores
    WHERE kpi_key = 'hs_extras'
      AND anio = EXTRACT(YEAR FROM now())::int
 );

COMMIT;
