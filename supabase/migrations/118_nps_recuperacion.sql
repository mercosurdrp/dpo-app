-- =============================================
-- 118 · NPS · Seguimiento de recuperación de clientes
-- =============================================
-- Fase 1: baseline en los planes (la encuesta que motivó el plan) para
-- detectar la re-encuesta posterior y medir si el cliente se recuperó.
-- Fase 2: RMD individual por cliente (señal temprana entre encuestas NPS,
-- el sync quincenal ya baja estas puntuaciones del Power BI de Quilmes).
--
-- Idempotente. Solo Pampeana.
-- =============================================

BEGIN;

-- a) Baseline del plan: foto del cliente al momento de crear el plan.
ALTER TABLE nps_planes
  ADD COLUMN IF NOT EXISTS baseline_score SMALLINT,
  ADD COLUMN IF NOT EXISTS baseline_categoria TEXT,
  ADD COLUMN IF NOT EXISTS baseline_fecha TIMESTAMPTZ;

-- Backfill para planes existentes: última encuesta del cliente.
UPDATE nps_planes p
SET baseline_score = sub.score,
    baseline_categoria = sub.categoria,
    baseline_fecha = sub.fecha_enc
FROM (
  SELECT DISTINCT ON (cod_cliente) cod_cliente, score, categoria, fecha_enc
  FROM nps_encuestas
  ORDER BY cod_cliente, fecha_enc DESC
) sub
WHERE p.foco_cliente_id = sub.cod_cliente
  AND p.baseline_score IS NULL;

-- b) RMD individual por cliente (Rate My Delivery de cada entrega).
CREATE TABLE IF NOT EXISTS nps_rmd_cliente (
  rating_id TEXT PRIMARY KEY,
  cod_cliente BIGINT NOT NULL,
  fecha_puntuacion DATE NOT NULL,
  fecha_entrega DATE,
  nro_pedido TEXT,
  puntuacion SMALLINT NOT NULL,
  comentario TEXT,
  motivos TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nps_rmd_puntuacion_chk CHECK (puntuacion BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_nps_rmd_cliente
  ON nps_rmd_cliente(cod_cliente, fecha_puntuacion);

ALTER TABLE nps_rmd_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_rmd_select_auth" ON nps_rmd_cliente;
CREATE POLICY "nps_rmd_select_auth"
  ON nps_rmd_cliente FOR SELECT TO authenticated
  USING (true);

-- Escritura solo por service_role (el sync).
GRANT SELECT ON nps_rmd_cliente TO anon, authenticated;
GRANT ALL ON nps_rmd_cliente TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
