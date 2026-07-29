-- =============================================
-- RMD · Encuestas ENVIADAS por entrega (denominador de la tasa de respuesta)
-- =============================================
-- `nps_rmd_cliente` guarda solo las entregas que el cliente PUNTUÓ. La base
-- "BASE Distribuidores" del Power BI de Quilmes trae además las entregas que
-- recibieron la encuesta y NO fueron puntuadas (fila con Puntuacion vacía):
-- son el denominador real y hoy se descartaban en el sync.
--
-- Grano = una fila por encuesta enviada (Rmd_rating_id), que es una entrega
-- (NRO_PEDIDO único). `puntuada` marca si el cliente contestó, así una encuesta
-- que se responde después simplemente se actualiza por upsert.
--
-- 🚨 exportData() del Power BI corta en 30.000 filas y la base 2026 ya tiene
-- ~30.200 envíos: el sync la baja MES POR MES (DIM_FECHA.MES_ID) y dedupe por
-- rating_id. Si alguna vez vuelve a bajarse de una sola pasada, trunca callado.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS rmd_envios (
  rating_id        TEXT PRIMARY KEY,
  cod_cliente      BIGINT NOT NULL,
  fecha_entrega    DATE,
  fecha_puntuacion DATE,
  nro_pedido       TEXT,
  -- false = le llegó la encuesta y no la contestó
  puntuada         BOOLEAN NOT NULL DEFAULT false,
  puntuacion       SMALLINT,
  -- nombre/promotor/localidad vienen del maestro de Chess (incluye anulados),
  -- no de la encuesta: el que nunca puntuó no está en nps_rmd_cliente y hay que
  -- poder segmentarlo igual.
  nombre_cliente   TEXT,
  promotor         TEXT,
  localidad        TEXT,
  -- patente(s) del camión que entregó (Chess dsFleteroCarga, cruce por
  -- cliente + fecha de entrega). Permite ver a qué camión no le puntúan.
  vehiculo_entrega TEXT,
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rmd_envios_cliente  ON rmd_envios(cod_cliente);
CREATE INDEX IF NOT EXISTS idx_rmd_envios_entrega  ON rmd_envios(fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_rmd_envios_vehiculo ON rmd_envios(vehiculo_entrega);

ALTER TABLE rmd_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rmd_envios_select_auth" ON rmd_envios;
CREATE POLICY "rmd_envios_select_auth"
  ON rmd_envios FOR SELECT TO authenticated
  USING (true);

-- Escritura solo por service_role (el cron de los lunes).
GRANT SELECT ON rmd_envios TO anon, authenticated;
GRANT ALL ON rmd_envios TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
