-- =============================================================================
-- RMD sorteo: preparar la tabla de inscriptos para decenas de miles de filas
-- =============================================================================
-- La primera versión bajaba todos los inscriptos al navegador y cruzaba con el
-- RMD en memoria. Con decenas de miles de PDV eso no escala. Ahora:
--
--  1. El cliente al que corresponde cada inscripción se resuelve UNA vez, al
--     inscribirse (el número que cargó el PDV o, si no cargó, el que sugiere el
--     nombre + localidad), y queda guardado en `cod_cliente_resuelto`.
--  2. Una columna generada `busqueda` concentra todo lo buscable, con índice
--     trigram, para que el buscador sea una consulta con LIKE y no un filtro en
--     memoria.
--  3. La vista `v_rmd_sorteo_inscripciones` calcula el cruce con el RMD en la
--     base (¿calificó alguna entrega desde que se inscribió?) y expone un
--     `estado` para contar y filtrar: participa / todavia_no / sin_cruzar.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE rmd_sorteo_inscripciones
  ADD COLUMN IF NOT EXISTS cod_cliente_resuelto BIGINT,
  -- 'cargado' = lo escribió el PDV · 'por_nombre' = lo dedujo el sistema
  ADD COLUMN IF NOT EXISTS codigo_origen TEXT,
  ADD COLUMN IF NOT EXISTS nombre_sugerido TEXT;

-- Lo que ya estaba cargado con número se resuelve solo.
UPDATE rmd_sorteo_inscripciones
SET cod_cliente_resuelto = cod_cliente, codigo_origen = 'cargado'
WHERE cod_cliente IS NOT NULL AND cod_cliente_resuelto IS NULL;

ALTER TABLE rmd_sorteo_inscripciones
  ADD COLUMN IF NOT EXISTS busqueda TEXT GENERATED ALWAYS AS (
    lower(
      nombre_pdv || ' ' ||
      coalesce(cod_cliente::text, '') || ' ' ||
      coalesce(cod_cliente_resuelto::text, '') || ' ' ||
      direccion || ' ' ||
      localidad || ' ' ||
      nombre_contacto || ' ' ||
      telefono
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_rmd_sorteo_busqueda_trgm
  ON rmd_sorteo_inscripciones USING gin (busqueda gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_rmd_sorteo_resuelto
  ON rmd_sorteo_inscripciones (cod_cliente_resuelto)
  WHERE cod_cliente_resuelto IS NOT NULL;

-- Cruce con el RMD, fila por inscripción.
CREATE OR REPLACE VIEW v_rmd_sorteo_inscripciones AS
SELECT
  i.id,
  i.campania,
  i.nombre_pdv,
  i.cod_cliente,
  i.cod_cliente_resuelto,
  i.codigo_origen,
  i.nombre_sugerido,
  i.direccion,
  i.localidad,
  i.nombre_contacto,
  i.telefono,
  i.declara_califico,
  i.created_at,
  i.busqueda,
  coalesce(r.votos_desde, 0)   AS votos_desde,
  r.ultima_puntuacion,
  r.ultima_puntuacion_fecha,
  CASE
    WHEN coalesce(r.votos_desde, 0) > 0     THEN 'participa'
    WHEN i.cod_cliente_resuelto IS NOT NULL THEN 'todavia_no'
    ELSE 'sin_cruzar'
  END AS estado
FROM rmd_sorteo_inscripciones i
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS votos_desde,
    (array_agg(n.puntuacion ORDER BY n.fecha_puntuacion DESC))[1]       AS ultima_puntuacion,
    (array_agg(n.fecha_puntuacion ORDER BY n.fecha_puntuacion DESC))[1] AS ultima_puntuacion_fecha
  FROM nps_rmd_cliente n
  WHERE i.cod_cliente_resuelto IS NOT NULL
    AND n.cod_cliente = i.cod_cliente_resuelto
    AND n.fecha_puntuacion >= (i.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
) r ON true;

GRANT SELECT ON v_rmd_sorteo_inscripciones TO authenticated, service_role;

COMMENT ON VIEW v_rmd_sorteo_inscripciones IS
  'Inscriptos al sorteo RMD con el cruce contra nps_rmd_cliente: estado participa / todavia_no / sin_cruzar.';

-- -----------------------------------------------------------------------------
-- Ganadores: registro de cada sorteo y la evidencia de la entrega del premio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rmd_sorteo_ganadores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campania        TEXT NOT NULL,
  inscripcion_id  UUID NOT NULL REFERENCES rmd_sorteo_inscripciones(id) ON DELETE RESTRICT,
  premio          TEXT NOT NULL,
  -- Cuántos participaban cuando se sorteó (queda como constancia).
  participantes   INTEGER NOT NULL,
  sorteado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sorteado_por    UUID REFERENCES profiles(id),
  sorteado_por_nombre TEXT,
  -- Entrega del premio (se completa después, con foto).
  entregado_en    TIMESTAMPTZ,
  entregado_por   UUID REFERENCES profiles(id),
  entregado_por_nombre TEXT,
  observaciones   TEXT,
  -- Fotos en el bucket 'rmd-planes', prefijo sorteo/<ganador_id>/
  archivos        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rmd_sorteo_ganadores_campania
  ON rmd_sorteo_ganadores (campania, sorteado_en DESC);

-- Un mismo inscripto no puede ganar dos veces en la misma campaña.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rmd_sorteo_ganadores_inscripcion
  ON rmd_sorteo_ganadores (campania, inscripcion_id);

ALTER TABLE rmd_sorteo_ganadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rmd_sorteo_ganadores_select_auth" ON rmd_sorteo_ganadores;
CREATE POLICY "rmd_sorteo_ganadores_select_auth"
  ON rmd_sorteo_ganadores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rmd_sorteo_ganadores_insert_auth" ON rmd_sorteo_ganadores;
CREATE POLICY "rmd_sorteo_ganadores_insert_auth"
  ON rmd_sorteo_ganadores FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "rmd_sorteo_ganadores_update_auth" ON rmd_sorteo_ganadores;
CREATE POLICY "rmd_sorteo_ganadores_update_auth"
  ON rmd_sorteo_ganadores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON rmd_sorteo_ganadores TO authenticated;
GRANT ALL ON rmd_sorteo_ganadores TO service_role;

COMMENT ON TABLE rmd_sorteo_ganadores IS
  'Ganadores del sorteo RMD por campaña, con la foto de la entrega del premio (bucket rmd-planes, prefijo sorteo/).';
