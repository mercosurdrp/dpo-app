-- =============================================
-- 068 · Reuniones · Borrar indicadores duplicados del tablero de logística
-- =============================================
-- El tablero de la reunión de logística tenía dos indicadores manuales que
-- duplicaban indicadores AUTO ya existentes (calculados por código en
-- getIndicadoresMes):
--   "Bultos totales"  → duplica el AUTO "Bultos vendidos"
--   "Rechazo"         → duplica el AUTO "Rechazos %"
-- Los manuales quedaban siempre en cero porque nadie los carga. Sus nombres
-- no coincidían con el set NOMBRES_AUTO de dedupe, así que se mostraban como
-- filas vacías junto a la versión AUTO con datos.
--
-- ON DELETE CASCADE en reuniones_indicadores_valores limpia los valores.
-- Idempotente (DELETE por nombre exacto + tipo). Reload de schema al final.
-- =============================================

BEGIN;

DELETE FROM reuniones_indicadores_config
WHERE tipo = 'logistica'
  AND nombre IN ('Bultos totales', 'Rechazo');

COMMIT;

-- =============================================
-- Reload schema cache de PostgREST (fuera de transacción)
-- =============================================
NOTIFY pgrst, 'reload schema';
