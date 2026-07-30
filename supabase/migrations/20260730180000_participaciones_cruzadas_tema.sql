-- =============================================
-- Participación cruzada: TEMA a tratar y QUIÉN debería participar
-- =============================================
-- Cuando se PROGRAMA la participación ya se define qué tema se va a llevar a la
-- reunión del otro área y quién tendría que ir. Queda escrito de antemano para
-- que la evidencia no sea sólo "fui", sino "fui a hablar de esto, con esta
-- gente" — y para poder comparar lo previsto contra lo que realmente pasó
-- (`participantes` guarda quiénes participaron de verdad).
--
-- Las fotos siguen viviendo en `fotos` (paths del bucket privado `reuniones`).
-- Desde ahora se guardan bajo una subcarpeta que dice QUÉ es cada una:
--   cruces/<id>/tema/...          -> captura de lo que se trató
--   cruces/<id>/participantes/... -> foto de los participantes
--   cruces/<id>/...               -> fotos viejas, sin categoría
-- =============================================

ALTER TABLE participaciones_cruzadas
  ADD COLUMN IF NOT EXISTS tema TEXT;

ALTER TABLE participaciones_cruzadas
  ADD COLUMN IF NOT EXISTS participantes_previstos TEXT;

COMMENT ON COLUMN participaciones_cruzadas.tema IS
  'Tema que se va a tratar (se define al programar la participación).';

COMMENT ON COLUMN participaciones_cruzadas.participantes_previstos IS
  'Quiénes deberían participar (se define al programar). `participantes` es quiénes fueron.';
