-- Dimensionamiento (DPO Planeamiento 2.3) — SOLO Pampeana
-- Revisión del 22/09/2026 contra el manual y la planilla de Casa Central:
--   · horas_fijas_generales: horas/día de tareas generales que no dependen del
--     volumen (limpieza, prensa, orden). Casa Central las modela como 2 h/día
--     fijas; acá se suman a las horas variables de reempaque (bultos ÷ bul/HH)
--     y el rol "Tareas generales" pasa a dimensionarse en HORAS, no en bultos.
--   · umbral_ocupacion_ociosa: por debajo de esta ocupación (necesarios ÷
--     dotación, o CEq ÷ capacidad instalada) el módulo marca "Capacidad
--     ociosa" — la alerta por EXCESO que pide R2.3.2 y que el SOP Rev 01 fija
--     en 70 %. Hasta ahora sólo se alertaba por falta.
begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS horas_fijas_generales   numeric NOT NULL DEFAULT 2;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS umbral_ocupacion_ociosa numeric NOT NULL DEFAULT 0.70;

commit;
