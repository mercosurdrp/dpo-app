-- =============================================================================
-- RMD: inscripciones al sorteo del folleto (QR)
-- =============================================================================
-- Plan «Entregar folletos en PDV» (foco: tasa de respuesta del RMD). Cada
-- reparto deja en el punto de venta un folleto que pide calificar la entrega
-- en BEES (Rate My Delivery) y trae un QR a /sorteo-rmd, una página pública
-- donde el PDV se inscribe al sorteo con nombre, dirección y contacto.
--
-- Participa el PDV que se inscribió Y calificó al menos una entrega desde que
-- se inscribió: el cruce se hace contra nps_rmd_cliente por cod_cliente (el
-- que cargó el PDV, o el que sugiere el nombre si no lo cargó).
--
-- Escribe sólo el service_role (la página pública pasa por una server action
-- con la clave de servicio); lee cualquier usuario logueado.

CREATE TABLE IF NOT EXISTS rmd_sorteo_inscripciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campania         TEXT NOT NULL DEFAULT 'folleto-2026-09',
  nombre_pdv       TEXT NOT NULL,
  cod_cliente      BIGINT,
  direccion        TEXT NOT NULL,
  localidad        TEXT NOT NULL,
  nombre_contacto  TEXT NOT NULL,
  telefono         TEXT NOT NULL,
  -- Lo que declara el PDV al inscribirse ("ya califiqué mi entrega en BEES").
  -- Es sólo declarativo: lo que vale es el cruce con nps_rmd_cliente.
  declara_califico BOOLEAN NOT NULL DEFAULT false,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rmd_sorteo_inscripciones_campania
  ON rmd_sorteo_inscripciones (campania, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rmd_sorteo_inscripciones_cod_cliente
  ON rmd_sorteo_inscripciones (cod_cliente)
  WHERE cod_cliente IS NOT NULL;

ALTER TABLE rmd_sorteo_inscripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rmd_sorteo_select_auth" ON rmd_sorteo_inscripciones;
CREATE POLICY "rmd_sorteo_select_auth"
  ON rmd_sorteo_inscripciones FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON rmd_sorteo_inscripciones TO authenticated;
GRANT ALL ON rmd_sorteo_inscripciones TO service_role;

COMMENT ON TABLE rmd_sorteo_inscripciones IS
  'PDV inscriptos al sorteo del folleto RMD (QR a /sorteo-rmd). Participa el que ademas califico una entrega en BEES desde la inscripcion.';
