-- Un avance de plan OWD es válido si trae comentario, archivo O cambio de estado.
-- La constraint original (145) no contemplaba el caso "solo cambio de estado",
-- que el formulario permite (p. ej. marcar completado sin comentar) y rompía
-- con: new row violates check constraint "owd_avances_payload_chk".
ALTER TABLE owd_planes_avances DROP CONSTRAINT owd_avances_payload_chk;
ALTER TABLE owd_planes_avances ADD CONSTRAINT owd_avances_payload_chk CHECK (
  coalesce(btrim(comentario), '') <> ''
  OR archivo_path IS NOT NULL
  OR estado_resultante IS NOT NULL
);
