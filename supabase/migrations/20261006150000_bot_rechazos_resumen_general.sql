-- =============================================================
-- Bot de rechazos: resumen general diario (18:45) para gerencia
-- =============================================================
-- Además del resumen por equipo que reciben los supervisores, estos números
-- reciben el general de Pampeana con el detalle por supervisor y vendedor.
-- Se edita acá (lista JSON de {nombre, phone} en formato 549...).
-- Idempotente. Correr en un minuto :x3–:x7 (el cron lee la config a los :x0).

SET lock_timeout = '10s';

ALTER TABLE foxtrot_alertas_config
  ADD COLUMN IF NOT EXISTS resumen_general_destinatarios JSONB NOT NULL DEFAULT '[]';

UPDATE foxtrot_alertas_config
   SET resumen_general_destinatarios = '[
         {"nombre": "FAUSTO AZZARETTI", "phone": "5493407494491"},
         {"nombre": "SEBASTIAN ROSELLI", "phone": "5493364512183"},
         {"nombre": "FRANCISCO PEREZ", "phone": "5493364112627"}
       ]'::jsonb
 WHERE id = 1;
