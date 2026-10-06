-- =============================================================
-- MISIONES · Bot de rechazos completo (pegar en el SQL Editor de Supabase
-- de MISIONES, proyecto bvqmsrnrdrxprbggfziu). NO correr en Pampeana.
-- =============================================================
-- Junta, en orden, las migraciones del bot que Misiones no tiene:
--   062 (bot_vendedores_wa, bot_clientes_cache, log), 157 (alertas + config),
--   20261006120000 (seguimiento) y 20261006150000 (resumen general),
-- sin los datos propios de Pampeana, + el equipo de Misiones al final.
-- Todo en una transacción: si algo falla no queda nada a medias.

BEGIN;

-- =============================================================
-- 062 — WhatsApp bot para vendedores (top pedidos del día siguiente)
-- =============================================================
-- Soporta el flujo: vendedor manda WA → bot devuelve top N pedidos
-- por tamaño del día siguiente para confirmar con clientes antes
-- de la entrega. Reduce rechazos por sobrepedido.
--
-- 3 tablas:
--   bot_vendedores_wa     — mapeo phone_number → id_promotor Chess
--   bot_clientes_cache    — cliente → promotor (sync diaria desde Chess)
--   bot_conversaciones_log — log de toda interacción (debug + métrica)

-- ----------------------------- VENDEDORES -----------------------------

CREATE TABLE IF NOT EXISTS bot_vendedores_wa (
  id_promotor   TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  phone_number  TEXT NOT NULL UNIQUE,                  -- e.164 sin "+", ej "5491155112233"
  empresa       TEXT NOT NULL DEFAULT 'pampeana'
                CHECK (empresa IN ('pampeana','misiones')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_vendedores_wa_phone_idx
  ON bot_vendedores_wa(phone_number) WHERE activo;

CREATE OR REPLACE FUNCTION bot_vendedores_wa_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bot_vendedores_wa_updated_at_trg ON bot_vendedores_wa;
CREATE TRIGGER bot_vendedores_wa_updated_at_trg
  BEFORE UPDATE ON bot_vendedores_wa
  FOR EACH ROW EXECUTE FUNCTION bot_vendedores_wa_set_updated_at();

-- ----------------------------- CACHE CLIENTES -----------------------------

-- Cruce id_cliente → id_promotor que se popula con el sync diario.
-- En Chess Pampeana el promotor sale de:
--   cliente.eClifuerza[].idRuta → rutasVenta.idPersonal
-- (no usar /ventas/.idVendedor — ese es operador, no promotor)

CREATE TABLE IF NOT EXISTS bot_clientes_cache (
  id_cliente      TEXT PRIMARY KEY,
  id_promotor     TEXT,                                -- NULL si no se pudo resolver
  nombre_cliente  TEXT,
  telefono        TEXT,
  localidad       TEXT,
  empresa         TEXT NOT NULL DEFAULT 'pampeana'
                  CHECK (empresa IN ('pampeana','misiones')),
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_clientes_cache_promotor_idx
  ON bot_clientes_cache(id_promotor) WHERE id_promotor IS NOT NULL;

-- ----------------------------- LOG -----------------------------

CREATE TABLE IF NOT EXISTS bot_conversaciones_log (
  id            BIGSERIAL PRIMARY KEY,
  phone_number  TEXT NOT NULL,
  id_promotor   TEXT,                                  -- NULL si no se reconoció
  mensaje_in    TEXT,
  mensaje_out   TEXT,
  source        TEXT NOT NULL                          -- webhook / preview / script
                CHECK (source IN ('webhook','preview','script')),
  error         TEXT,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_conv_log_phone_idx
  ON bot_conversaciones_log(phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS bot_conv_log_created_idx
  ON bot_conversaciones_log(created_at DESC);

-- ----------------------------- RLS -----------------------------
-- Las 3 tablas son backend-only. Se accede vía service-role en los
-- endpoints /api/wa-bot/*. La policy authenticated es solo para la
-- futura UI de gestión de vendedores.

ALTER TABLE bot_vendedores_wa ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_clientes_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_conversaciones_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY bot_vendedores_admin_all ON bot_vendedores_wa
  FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY bot_clientes_read ON bot_clientes_cache
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','supervisor'));

CREATE POLICY bot_conv_admin_read ON bot_conversaciones_log
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

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


-- =============================================================
-- Bot de rechazos: resumen general diario (18:45) para gerencia
-- =============================================================
-- Además del resumen por equipo que reciben los supervisores, estos números
-- reciben el general de Pampeana con el detalle por supervisor y vendedor.
-- Se edita acá (lista JSON de {nombre, phone} en formato 549...).
-- Idempotente. Correr en un minuto :x3–:x7 (el cron lee la config a los :x0).



ALTER TABLE foxtrot_alertas_config
  ADD COLUMN IF NOT EXISTS resumen_general_destinatarios JSONB NOT NULL DEFAULT '[]';



-- =============================================================
-- Equipo de Misiones (docx completado por Fausto el 06/10/2026)
-- =============================================================
-- id_promotor = idPersonal de Chess Misiones (los 22 vendedores con clientes
-- no repiten id entre Eldorado e Iguazú). Supervisores con id sintético.
-- Fuera: Fleitas Mariana y Gimenez Lucas (no son supervisores), cuentas
-- Vi People / Vi Md / Vi Eldo / Mostrador Iguazú, vendedores sin clientes.
-- Burgin y Butnen (Eldorado) quedan SIN supervisor hasta confirmar quién es.

INSERT INTO bot_vendedores_wa (id_promotor, nombre, phone_number, empresa, rol, supervisor_id, activo, recibe_alertas_rechazo)
VALUES
  ('sup_irala', 'IRALA IVAN', '5493751580487', 'misiones', 'supervisor', NULL, true, true),
  ('sup_bargas', 'BARGAS RONALDO', '5493751370266', 'misiones', 'supervisor', NULL, true, true),
  ('sup_bogado', 'BOGADO LEONARDO', '5493757633370', 'misiones', 'supervisor', NULL, true, true)
ON CONFLICT (id_promotor) DO UPDATE SET
  nombre = EXCLUDED.nombre, phone_number = EXCLUDED.phone_number, empresa = 'misiones',
  rol = 'supervisor', activo = true, recibe_alertas_rechazo = true;

INSERT INTO bot_vendedores_wa (id_promotor, nombre, phone_number, empresa, rol, supervisor_id, activo, recibe_alertas_rechazo)
VALUES
  ('45', 'BRIZUELA SANTIAGO', '5493757685793', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('206', 'CANDIA NAHUEL', '5493757621638', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('11', 'CARTAGENA JOAN', '5493751587185', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('9', 'GOMEZ CESAR', '5493751587241', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('22', 'JARA ADRIAN', '5493751531387', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('42', 'LOPEZ MATEO', '5493751383841', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('15', 'MIRANDA LETICIA', '5493751501579', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('10', 'PANIAGUA FABRICIO', '5493751587205', 'misiones', 'promotor', 'sup_bargas', true, true),
  ('50', 'ALVEZ DE LIMA LUCAS', '5493757676299', 'misiones', 'promotor', 'sup_bogado', true, true),
  ('52', 'BOTHNER ERICK', '5493757634007', 'misiones', 'promotor', 'sup_bogado', true, true),
  ('51', 'LARA LUCAS', '5493757671974', 'misiones', 'promotor', 'sup_bogado', true, true),
  ('53', 'SPILIER MATIAS', '5493757621446', 'misiones', 'promotor', 'sup_bogado', true, true),
  ('3', 'AVALOS BRIAN', '5493751493527', 'misiones', 'promotor', 'sup_irala', true, true),
  ('31', 'CASTILLO CINTIA NOEMI', '5493751202996', 'misiones', 'promotor', 'sup_irala', true, true),
  ('32', 'CRISTALDO RODRIGO', '5493751360363', 'misiones', 'promotor', 'sup_irala', true, true),
  ('1', 'DURAN LUIS', '5493751587184', 'misiones', 'promotor', 'sup_irala', true, true),
  ('13', 'ERHARD CRISTIAN', '5493751527982', 'misiones', 'promotor', 'sup_irala', true, true),
  ('5', 'FERNANDEZ AGUSTIN', '5493751587196', 'misiones', 'promotor', 'sup_irala', true, true),
  ('7', 'FRAGOSO ESTEBAN', '5493751587208', 'misiones', 'promotor', 'sup_irala', true, true),
  ('4', 'FREITAS ALE CLAUS', '5493751587190', 'misiones', 'promotor', 'sup_irala', true, true),
  ('14', 'BURGIN DAIANA', '5493751396722', 'misiones', 'promotor', NULL, true, true),
  ('12', 'BUTNEN ORNELA BEATRIZ', '5493751493883', 'misiones', 'promotor', NULL, true, true)
ON CONFLICT (id_promotor) DO UPDATE SET
  nombre = EXCLUDED.nombre, phone_number = EXCLUDED.phone_number, empresa = 'misiones',
  rol = 'promotor', supervisor_id = EXCLUDED.supervisor_id, activo = true,
  recibe_alertas_rechazo = true;

-- Config: arranca en SIMULACIÓN (dry_run, envíos apagados) para el día de prueba.
-- Resumen general de las 18:45: Enzo Orsetti.
UPDATE foxtrot_alertas_config
   SET dry_run = true,
       envios_activos = false,
       ventana_desde = '07:00',
       ventana_hasta = '18:30',
       resumen_general_destinatarios = '[{"nombre": "ENZO ORSETTI", "phone": "5493764241315"}]'::jsonb
 WHERE id = 1;

COMMIT;
