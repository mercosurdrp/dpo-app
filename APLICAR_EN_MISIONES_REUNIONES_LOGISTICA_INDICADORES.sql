-- =============================================================
-- REUNIONES DE LOGÍSTICA (MISIONES) · Reorganización de indicadores
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
-- =============================================================
-- Cambios pedidos (sólo tipo='logistica'):
--   1) Ocultar WNP y WQI (ya no se muestran en la reunión de logística).
--   2) Faltantes se unifica con Roturas bajo el concepto "Pérdidas":
--      Roturas -> "Pérdidas" (única fila manual); Faltantes se oculta.
--   3) LTI/TRI pasan a "SIF Actual"/"SIF Potencial" y se agrega
--      "SIF Precursor" (nueva fila manual, vacía).
--   4) Ausentismo pasa a carga manual (el cálculo automático se desactiva en
--      código) y se deja en 0 lo que va del mes en curso.
--
-- Idempotente. NO toca otros tenants. El reordenamiento (bloque SIF +
-- Ausentismo arriba) lo maneja el código en src/actions/reuniones.ts.
-- =============================================================

BEGIN;

-- 1) Ocultar WNP y WQI ----------------------------------------
UPDATE reuniones_indicadores_config
SET activo = false, updated_at = now()
WHERE tipo = 'logistica' AND nombre IN ('WNP', 'WQI');

-- 2) Faltantes + Roturas -> "Pérdidas" ------------------------
-- Roturas se renombra al concepto combinado; Faltantes se oculta.
UPDATE reuniones_indicadores_config
SET nombre = 'Pérdidas', updated_at = now()
WHERE tipo = 'logistica' AND nombre = 'Roturas';

UPDATE reuniones_indicadores_config
SET activo = false, updated_at = now()
WHERE tipo = 'logistica' AND nombre = 'Faltantes';

-- 3) LTI/TRI -> SIF + nueva fila "SIF Precursor" --------------
UPDATE reuniones_indicadores_config
SET nombre = 'SIF Actual', updated_at = now()
WHERE tipo = 'logistica' AND nombre = 'LTI';

UPDATE reuniones_indicadores_config
SET nombre = 'SIF Potencial', updated_at = now()
WHERE tipo = 'logistica' AND nombre = 'TRI';

INSERT INTO reuniones_indicadores_config (tipo, nombre, unidad, meta, orden, activo, agregacion)
SELECT 'logistica', 'SIF Precursor', 'cant.', NULL::numeric, 25, true, 'suma'
WHERE NOT EXISTS (
  SELECT 1 FROM reuniones_indicadores_config
  WHERE tipo = 'logistica' AND nombre = 'SIF Precursor'
);

-- 4) Ausentismo: dejar en 0 lo que va del mes en curso --------
-- El indicador ya existe como fila manual (config 'Ausentismo'); su cálculo
-- automático desde Foxtrot se quitó en código. Sembramos 0 para las reuniones
-- de logística del mes en curso que aún no tengan valor cargado.
INSERT INTO reuniones_indicadores_valores (reunion_id, indicador_id, valor)
SELECT r.id, c.id, 0
FROM reuniones r
CROSS JOIN reuniones_indicadores_config c
WHERE r.tipo = 'logistica'
  AND c.tipo = 'logistica' AND c.nombre = 'Ausentismo'
  AND date_trunc('month', r.fecha) = date_trunc('month', CURRENT_DATE)
  AND r.fecha <= CURRENT_DATE
ON CONFLICT (reunion_id, indicador_id) DO NOTHING;

COMMIT;

-- =============================================================
-- Verificación (opcional, correr aparte):
--   SELECT nombre, activo, orden, agregacion
--   FROM reuniones_indicadores_config
--   WHERE tipo = 'logistica' ORDER BY orden;
-- =============================================================

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
