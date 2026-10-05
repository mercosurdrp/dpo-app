-- =============================================================
-- Bot de rechazos: seguimiento a la hora del aviso + efectividad
-- =============================================================
-- Una hora después de avisar un rechazo, el bot le pregunta a cada
-- vendedor del cliente si se pudo evitar (1 evitado / 2 reprogramado /
-- 3 perdido) y cómo lo solucionaron. Vale la primera respuesta; las
-- preguntas de los otros vendedores de la misma alerta se cierran.
--
-- foxtrot_alertas_preguntas = estado de la conversación (1 fila por
-- vendedor y alerta). El resultado final se denormaliza en la alerta
-- (seguimiento_*) para que los indicadores salgan de una sola tabla.
-- Idempotente. Solo Pampeana.

-- Sin transacción a propósito: cada ALTER toma el lock un instante y, si el
-- cron está leyendo, espera hasta 10 s en vez de chocar (deadlock 05/10).
SET lock_timeout = '10s';

-- ----------------------- resultado en la alerta -----------------------
ALTER TABLE foxtrot_alertas_rechazo
  ADD COLUMN IF NOT EXISTS seguimiento_resultado TEXT
    CHECK (seguimiento_resultado IN ('evitado','reprogramado','perdido','sin_respuesta')),
  ADD COLUMN IF NOT EXISTS seguimiento_como       TEXT,   -- lo que escribió (o dictó) el vendedor
  ADD COLUMN IF NOT EXISTS seguimiento_categoria  TEXT,   -- clasificación automática del "cómo"
  ADD COLUMN IF NOT EXISTS seguimiento_resumen    TEXT,   -- resumen corto del "cómo"
  ADD COLUMN IF NOT EXISTS seguimiento_por_id     TEXT,   -- id_promotor que respondió
  ADD COLUMN IF NOT EXISTS seguimiento_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS seguimiento_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS fx_alertas_seguimiento_idx
  ON foxtrot_alertas_rechazo(fecha, seguimiento_resultado);

-- ----------------------------- preguntas -----------------------------
CREATE TABLE IF NOT EXISTS foxtrot_alertas_preguntas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id       UUID NOT NULL REFERENCES foxtrot_alertas_rechazo(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  id_promotor     TEXT NOT NULL,
  nombre          TEXT,
  phone           TEXT NOT NULL,
  -- en_cola → preguntada → esperando_como → respondida
  --                      ↘ sin_respuesta (no contestó ni al recordatorio)
  -- cerrada_por_otro: respondió otro vendedor de la misma alerta
  estado          TEXT NOT NULL DEFAULT 'en_cola' CHECK (estado IN
                    ('en_cola','preguntada','esperando_como','respondida','sin_respuesta','cerrada_por_otro')),
  preguntada_at   TIMESTAMPTZ,
  recordada_at    TIMESTAMPTZ,
  respondida_at   TIMESTAMPTZ,
  opcion          SMALLINT CHECK (opcion IN (1,2,3)),
  como            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alerta_id, id_promotor)
);

CREATE INDEX IF NOT EXISTS fx_preguntas_phone_abiertas_idx
  ON foxtrot_alertas_preguntas(phone, preguntada_at)
  WHERE estado IN ('en_cola','preguntada','esperando_como');
CREATE INDEX IF NOT EXISTS fx_preguntas_fecha_idx
  ON foxtrot_alertas_preguntas(fecha);

DROP TRIGGER IF EXISTS fx_preguntas_updated_at_trg ON foxtrot_alertas_preguntas;
CREATE TRIGGER fx_preguntas_updated_at_trg
  BEFORE UPDATE ON foxtrot_alertas_preguntas
  FOR EACH ROW EXECUTE FUNCTION fx_alertas_set_updated_at();

-- Lectura para la UI; toda escritura por service-role (cron + webhook).
ALTER TABLE foxtrot_alertas_preguntas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fx_preguntas_select_auth ON foxtrot_alertas_preguntas;
CREATE POLICY fx_preguntas_select_auth ON foxtrot_alertas_preguntas
  FOR SELECT TO authenticated USING (true);

-- ------------------------------- config -------------------------------
ALTER TABLE foxtrot_alertas_config
  ADD COLUMN IF NOT EXISTS seguimiento_activo       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS seguimiento_demora_min   INT     NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS resumen_diario_activo    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS resumen_ultima_fecha     DATE;

