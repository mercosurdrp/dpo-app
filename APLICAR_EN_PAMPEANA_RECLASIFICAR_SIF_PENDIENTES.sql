-- =============================================
-- Reportes de Seguridad: reclasificar retroactivamente como "No es SIF"
-- los reportes que quedaron sin clasificar.
--
-- El 26/08/2026 (commit f2012144) se agregó la 4ª opción "No es SIF" al
-- selector de Tipo de SIF, guardada como sif = false / tipo_sif = null
-- (no se pudo agregar un valor al enum `reporte_seguridad_tipo_sif` desde
-- la VM). Los reportes cargados antes de esa fecha, y los posteriores que
-- se guardaron sin tocar ese selector, quedaron con sif = null y
-- tipo_sif = null: en la tabla y el detalle se ven como "—" en vez de
-- "No es SIF".
--
-- No toca reportes ya clasificados (SIF actual/potencial/precursor, o que
-- ya tengan sif en true/false). Idempotente: sólo actualiza los NULL.
-- Aplicar en Pampeana. Ver también la versión Misiones.
-- =============================================

-- Antes: cuántos reportes quedan sin clasificar
SELECT count(*) AS sin_clasificar
FROM reportes_seguridad
WHERE sif IS NULL AND tipo_sif IS NULL;

BEGIN;

UPDATE reportes_seguridad
SET sif = false
WHERE sif IS NULL AND tipo_sif IS NULL;

COMMIT;

-- Después: debería dar 0
SELECT count(*) AS sin_clasificar
FROM reportes_seguridad
WHERE sif IS NULL AND tipo_sif IS NULL;
