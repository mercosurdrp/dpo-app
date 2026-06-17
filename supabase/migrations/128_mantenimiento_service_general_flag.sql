-- Distingue el "service general / rodado" (cada 20.000 km) del resto de las OTs
-- importadas de Cloudfleet (correctivos y trabajos menores que se importaron como
-- 'preventivo'). El Tablero operativo ancla la proyección del próximo service en
-- el ÚLTIMO registro con es_service_general = true (replicando la planilla
-- "Próximo Service GRAL FLOTA"); si una unidad no tiene ninguno, cae al último
-- preventivo. La carga de una OT de service general (pestaña Órdenes de Trabajo)
-- inserta filas con este flag en true, reiniciando el contador.
ALTER TABLE mantenimiento_realizados
  ADD COLUMN IF NOT EXISTS es_service_general boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mant_realizados_service_general
  ON mantenimiento_realizados (dominio, fecha DESC)
  WHERE es_service_general;
