-- 151: Tiempo fuera de servicio por orden de trabajo, para calcular la
-- disponibilidad de flota (pestaña "Seguimiento de flota").
--   Si la OT sacó el camión de circulación, se cargan estas fechas; los días
--   entre ambas (inclusive) cuentan como "parado". La causa (correctivo/preventivo)
--   se deriva del tipo de la OT. Si la OT no sacó la unidad de ruta, quedan NULL.
alter table mantenimiento_realizados
  add column if not exists fuera_servicio_desde date,
  add column if not exists fuera_servicio_hasta date;
