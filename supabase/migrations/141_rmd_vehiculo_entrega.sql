-- =============================================
-- 141 · RMD · Patente del vehículo que entregó (vínculo con el chofer)
-- =============================================
-- Cada puntuación RMD se vincula a la PATENTE del camión que hizo la entrega.
-- La patente sale de Chess (/ventas/ campo dsFleteroCarga) cruzando por
-- cod_cliente + fecha de entrega (el sync quincenal y un backfill la completan).
-- El nombre del chofer se resuelve en lectura por la patente contra
-- mapeo_empleado_fletero → empleados (mapeo que mantiene TML), por eso acá
-- solo se guarda la patente y no se desnormaliza el chofer.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

ALTER TABLE nps_rmd_cliente
  ADD COLUMN IF NOT EXISTS vehiculo_entrega TEXT;

COMMENT ON COLUMN nps_rmd_cliente.vehiculo_entrega IS
  'Patente(s) del camión que entregó (Chess dsFleteroCarga, cruce cod_cliente+fecha_entrega). Multi-patente (2da vuelta) unidas con " / ". Chofer se resuelve por mapeo_empleado_fletero.';

COMMIT;
