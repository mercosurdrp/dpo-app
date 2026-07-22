-- =============================================
-- Adjuntos en los avances de los planes de acción del presupuesto
-- =============================================
-- Hasta ahora la evidencia colgaba de la CABECERA del plan
-- (presupuestos_planes_accion.adjunto_urls): se sabía que había un archivo,
-- pero no de qué momento ni de qué acción. Adjuntar en el avance pega la
-- evidencia al hecho ("el 22/07 se renegoció la tarifa" + el mail).
--
-- Mismo criterio que la cabecera: array de URLs públicas del bucket
-- "planes-accion-presupuesto", no tabla aparte.
--
-- 🚨 Storage NO tiene FK: si se borra un plan o un paso, los avances caen por
-- ON DELETE CASCADE pero los archivos quedarían huérfanos en el bucket. La
-- limpieza se hace a mano en eliminarPlanAccion() / eliminarPaso().
-- =============================================

BEGIN;

ALTER TABLE presupuestos_planes_accion_avances
  ADD COLUMN IF NOT EXISTS adjunto_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN presupuestos_planes_accion_avances.adjunto_urls IS
  'URLs públicas en el bucket planes-accion-presupuesto. Sin FK: la limpieza al borrar el plan/paso se hace desde la app.';

COMMIT;

NOTIFY pgrst, 'reload schema';
