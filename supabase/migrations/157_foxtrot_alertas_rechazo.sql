-- =============================================================
-- 157 — Alertas WhatsApp de rechazos en reparto (Foxtrot)
-- =============================================================
-- Cuando el chofer marca un rechazo en la app de Foxtrot, un cron
-- (/api/foxtrot/cron-alertas, cada 5 min en ventana de reparto) lo
-- detecta, lo persiste acá y avisa por WhatsApp (Evolution, mismo
-- canal que el bot de pedidos) al promotor del cliente y a su
-- supervisor para intentar revertirlo con el camión aún en zona.
-- El mismo cron resuelve después el OUTCOME automático de cada
-- alerta (recuperado mismo día / próxima entrega OK / reincidió).
--
-- Solo Pampeana (el cron es no-op en Misiones).

-- ------------------- bot_vendedores_wa: rol + supervisor -------------------
-- Los supervisores se cargan como filas más con id_promotor sintético
-- ("sup_caballero") — no colisionan con los ids numéricos de Chess.

ALTER TABLE bot_vendedores_wa
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'promotor'
    CHECK (rol IN ('promotor','supervisor')),
  ADD COLUMN IF NOT EXISTS supervisor_id TEXT
    REFERENCES bot_vendedores_wa(id_promotor) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recibe_alertas_rechazo BOOLEAN NOT NULL DEFAULT true;

-- ----------------------------- ALERTAS -----------------------------
-- 1 fila = 1 visita con rechazo (agrupa todos los ítems rechazados del
-- waypoint). dedup_key único = idempotencia real aunque el cron corra
-- dos veces en paralelo.

CREATE TABLE IF NOT EXISTS foxtrot_alertas_rechazo (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- identidad del rechazo
  dedup_key           TEXT NOT NULL UNIQUE,   -- "{dc}|{fecha}|{cliente_foxtrot}|{waypoint_id}"
  dc                  TEXT NOT NULL,          -- pergamino | ramallo
  fecha               DATE NOT NULL,          -- día operativo ART
  route_id            TEXT NOT NULL,
  waypoint_id         TEXT NOT NULL,
  -- cliente
  cliente_id_foxtrot  TEXT,                   -- ej "45902500010087"
  id_cliente          TEXT,                   -- Chess, ej "10087" (NULL si no matchea)
  cliente_nombre      TEXT,
  cliente_telefono    TEXT,
  cliente_localidad   TEXT,
  -- rechazo
  chofer_nombre       TEXT,
  ruta                TEXT,
  motivos             TEXT[] NOT NULL DEFAULT '{}',
  bultos              NUMERIC NOT NULL DEFAULT 0,
  parcial             BOOLEAN NOT NULL DEFAULT false,
  items               JSONB NOT NULL DEFAULT '[]',  -- [{producto,cantidad,motivo,notas,ts_ms}]
  rechazo_ts          TIMESTAMPTZ,
  -- destinatarios resueltos (denormalizados: la alerta es un registro histórico)
  id_promotor         TEXT,
  promotor_nombre     TEXT,
  promotor_phone      TEXT,
  supervisor_id       TEXT,
  supervisor_nombre   TEXT,
  supervisor_phone    TEXT,
  -- envío
  estado_envio        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_envio IN
                        ('pendiente','enviada','parcial','sin_telefono','error','dry_run','desactivada')),
  envio_detalle       JSONB NOT NULL DEFAULT '[]',  -- [{destinatario,phone,ok,status,ts,error?,texto?}]
  intentos_envio      INT NOT NULL DEFAULT 0,
  enviada_at          TIMESTAMPTZ,
  -- outcome automático (efectividad)
  outcome             TEXT NOT NULL DEFAULT 'pendiente' CHECK (outcome IN
                        ('pendiente','recuperado_mismo_dia','proxima_entrega_ok','reincidio','sin_nueva_entrega')),
  outcome_at          TIMESTAMPTZ,
  outcome_detalle     TEXT,                   -- ej "Entrega OK 12:41 (ruta 17)"
  proxima_entrega_fecha DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fx_alertas_fecha_idx
  ON foxtrot_alertas_rechazo(fecha DESC);
CREATE INDEX IF NOT EXISTS fx_alertas_outcome_abierto_idx
  ON foxtrot_alertas_rechazo(fecha) WHERE outcome = 'pendiente';
CREATE INDEX IF NOT EXISTS fx_alertas_cliente_idx
  ON foxtrot_alertas_rechazo(id_cliente, fecha DESC);
CREATE INDEX IF NOT EXISTS fx_alertas_promotor_idx
  ON foxtrot_alertas_rechazo(id_promotor, fecha DESC);

CREATE OR REPLACE FUNCTION fx_alertas_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fx_alertas_updated_at_trg ON foxtrot_alertas_rechazo;
CREATE TRIGGER fx_alertas_updated_at_trg
  BEFORE UPDATE ON foxtrot_alertas_rechazo
  FOR EACH ROW EXECUTE FUNCTION fx_alertas_set_updated_at();

-- ----------------------------- CONFIG -----------------------------
-- Single-row. Arranca con envíos APAGADOS y dry-run: se puede deployar
-- sin riesgo de mandar un solo mensaje hasta prenderlo desde la UI.

CREATE TABLE IF NOT EXISTS foxtrot_alertas_config (
  id                       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  envios_activos           BOOLEAN NOT NULL DEFAULT false,
  dry_run                  BOOLEAN NOT NULL DEFAULT true,
  ventana_desde            TIME NOT NULL DEFAULT '07:00',  -- hora ART
  ventana_hasta            TIME NOT NULL DEFAULT '18:30',
  max_intentos_envio       INT NOT NULL DEFAULT 3,
  dias_seguimiento_outcome INT NOT NULL DEFAULT 14,
  updated_by               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO foxtrot_alertas_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------- RLS -----------------------------
-- Lectura authenticated (UI de historial); TODA escritura por
-- service-role (cron + server actions), sin policies de INSERT/UPDATE.

ALTER TABLE foxtrot_alertas_rechazo ENABLE ROW LEVEL SECURITY;
ALTER TABLE foxtrot_alertas_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_alertas_select_auth ON foxtrot_alertas_rechazo;
CREATE POLICY fx_alertas_select_auth ON foxtrot_alertas_rechazo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fx_alertas_config_select_auth ON foxtrot_alertas_config;
CREATE POLICY fx_alertas_config_select_auth ON foxtrot_alertas_config
  FOR SELECT TO authenticated USING (true);

-- La UI de alertas muestra promotor/supervisor a supervisores también
-- (la policy existente de bot_vendedores_wa era solo admin FOR ALL).
DROP POLICY IF EXISTS bot_vendedores_read_sup ON bot_vendedores_wa;
CREATE POLICY bot_vendedores_read_sup ON bot_vendedores_wa
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','supervisor'));

-- ----------------------------- SEED -----------------------------
-- Supervisores sintéticos (teléfono placeholder hasta cargarlo por la
-- UI; activo=false = el cron no les envía) + mapeo promotor→supervisor
-- replicado del backend del mercosur-dashboard (SUPERVISOR_MAP_VEND).

INSERT INTO bot_vendedores_wa (id_promotor, nombre, phone_number, rol, activo, notes)
VALUES
  ('sup_caballero', 'CABALLERO SERGIO', 'pendiente-sup-caballero', 'supervisor', false, 'Cargar teléfono real desde la UI de equipo'),
  ('sup_petrillo',  'PETRILLO MAURO',   'pendiente-sup-petrillo',  'supervisor', false, 'Cargar teléfono real desde la UI de equipo')
ON CONFLICT (id_promotor) DO UPDATE SET rol = 'supervisor';

UPDATE bot_vendedores_wa SET supervisor_id = 'sup_caballero'
  WHERE id_promotor IN ('53','20','18','223','5','22','56','54');
UPDATE bot_vendedores_wa SET supervisor_id = 'sup_petrillo'
  WHERE id_promotor IN ('101','102','108','111','107','105','201','202');
