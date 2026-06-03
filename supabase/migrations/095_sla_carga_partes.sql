-- =============================================
-- 095 · SLA #6 (alm_carga) — corrige partes y reformula.
-- Cliente = Entrega, Proveedor = Almacén (el seed 088 los tenía invertidos).
-- Criterio: todos los camiones ruteados en el día quedan cargados antes de las
-- 23:59 hs (= antes de las 07:00 hs del día de reparto). Meta ≥ 95 % de los días.
-- Aplicado en Pampeana vía PATCH PostgREST; este archivo deja constancia para
-- rebuilds. Idempotente por código.
-- =============================================

BEGIN;

UPDATE slas
SET
  nombre = 'SLA de carga (reducir retrasos)',
  parte_cliente = 'Entrega',
  parte_proveedor = 'Almacén',
  descripcion = 'Acuerdo entre Entrega y Almacén: todos los camiones ruteados en el día quedan cargados antes de las 23:59 hs (antes de las 07:00 hs del día de reparto), para que la entrega salga sin demoras. Objetivo mensual ≥ 95 % de los días.'
WHERE codigo = 'alm_carga';

COMMIT;
