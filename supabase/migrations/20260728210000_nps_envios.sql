-- =============================================
-- NPS · Encuestas ENVIADAS (solicitadas) por cliente y mes
-- =============================================
-- El Power BI de Quilmes solo expone las encuestas RESPONDIDAS en sus páginas
-- visibles. Las ENVIADAS y la tasa de respuesta viven en la página OCULTA
-- "Detalle Distri" del reporte NPS, con grano de cliente. El sync semanal
-- (cron de los lunes, sync_nps_quincenal.py) las baja acá.
--
-- 🚨 En ese pivot la columna NPS viene VACÍA tanto para los que NO respondieron
-- como para los PASIVOS (NPS del cliente-mes = 0 ⇒ BLANK). Por eso esta tabla
-- guarda SOLO las enviadas: quién respondió se resuelve siempre cruzando con
-- nps_encuestas, que es la fuente de verdad de las respuestas.
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS nps_envios (
  cod_cliente    INT      NOT NULL,
  anio           SMALLINT NOT NULL,
  mes            SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  enviadas       SMALLINT NOT NULL DEFAULT 0,
  nombre_cliente TEXT,
  -- promotor/ruta/localidad vienen del maestro de Chess (vínculo PRE vigente),
  -- no de la encuesta: los clientes que nunca respondieron no están en
  -- nps_encuestas y igual hay que poder segmentarlos por promotor.
  promotor       TEXT,
  id_ruta        INT,
  localidad      TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cod_cliente, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_nps_envios_anio     ON nps_envios(anio);
CREATE INDEX IF NOT EXISTS idx_nps_envios_promotor ON nps_envios(promotor);

ALTER TABLE nps_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_envios_select_auth" ON nps_envios;
CREATE POLICY "nps_envios_select_auth"
  ON nps_envios FOR SELECT TO authenticated
  USING (true);

-- Escritura solo por service_role (el cron).
GRANT SELECT ON nps_envios TO anon, authenticated;
GRANT ALL ON nps_envios TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
