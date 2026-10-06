BEGIN;

-- =============================================================
-- Mensajes del cliente al chofer («Mi próxima entrega» de mercosur-atiende)
-- =============================================================
-- bot_choferes_wa: WhatsApp de cada chofer de Foxtrot (id por centro).
-- notas_chofer:    lo que dejó el cliente, a qué ruta/chofer fue y si se mandó.
-- Escritura solo por service role (endpoint /api/notas-chofer y cron-alertas).
-- Idempotente.

CREATE TABLE IF NOT EXISTS bot_choferes_wa (
  dc                 TEXT NOT NULL,
  foxtrot_driver_id  TEXT NOT NULL,
  nombre             TEXT NOT NULL,
  phone_number       TEXT NOT NULL,                 -- 549XXXXXXXXXX
  activo             BOOLEAN NOT NULL DEFAULT true,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dc, foxtrot_driver_id)
);
CREATE INDEX IF NOT EXISTS bot_choferes_wa_phone_idx ON bot_choferes_wa(phone_number);

CREATE TABLE IF NOT EXISTS notas_chofer (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL,
  dc                 TEXT NOT NULL,
  route_id           TEXT NOT NULL,
  route_nombre       TEXT,
  driver_id          TEXT,
  driver_nombre      TEXT,
  id_cliente         TEXT NOT NULL,
  cliente_nombre     TEXT,
  cliente_localidad  TEXT,
  paradas_antes      INT,
  mensaje            TEXT NOT NULL,
  contacto           TEXT,
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','enviada','sin_telefono','error')),
  envio_detalle      JSONB NOT NULL DEFAULT '[]',
  enviada_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_chofer_fecha_estado_idx ON notas_chofer(fecha, estado);
CREATE INDEX IF NOT EXISTS notas_chofer_cliente_idx ON notas_chofer(id_cliente, fecha);

ALTER TABLE bot_choferes_wa ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_chofer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_choferes_wa_select_auth ON bot_choferes_wa;
CREATE POLICY bot_choferes_wa_select_auth ON bot_choferes_wa
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','supervisor'));
DROP POLICY IF EXISTS notas_chofer_select_auth ON notas_chofer;
CREATE POLICY notas_chofer_select_auth ON notas_chofer
  FOR SELECT TO authenticated USING (true);

-- Choferes de Misiones (Foxtrot, rutas en los últimos 30 días al 06/10/2026).
-- Sin WhatsApp todavía: ninguno.
INSERT INTO bot_choferes_wa (dc, foxtrot_driver_id, nombre, phone_number)
VALUES
  ('eldorado', '51', 'ROLON VICTOR', '5493751371634'),
  ('eldorado', '2', 'BENITEZ FABIAN', '5493751523976'),
  ('eldorado', '6', 'GARCIA SERGIO', '5493751586103'),
  ('eldorado', '7', 'MEDINA RAMON', '5493751586016'),
  ('eldorado', '15', 'RAMIREZ RAUL IVAN', '5493751586056'),
  ('eldorado', '58', 'ESTECHE GABRIEL', '5493751586042'),
  ('eldorado', '83', 'GALEANO JUAN', '5493751565786'),
  ('eldorado', '14', 'RAMIREZ OSCAR OMAR', '5493751535769'),
  ('eldorado', '9', 'NUNEZ EDGAR', '5493751586038'),
  ('eldorado', '66', 'DAVALOS CESAR MATIAS', '5493751478970'),
  ('iguazu', '22', 'KUSI JAVIER GUSTAVO', '5493751586024'),
  ('iguazu', '28', 'DUARTE MOISES', '5493751535798'),
  ('iguazu', '21', 'SERVIN ELADIO', '5493751586127'),
  ('iguazu', '20', 'AGUIRRE DIEGO', '5493751586082'),
  ('iguazu', '27', 'ZEISS RICARDO', '5493751586123'),
  ('iguazu', '64', 'GAZTKE FRANCO', '5493751535784'),
  ('iguazu', '18', 'CLOSS GASTON EDUARDO', '5493751586080'),
  ('iguazu', '23', 'REICHEL JUAN CARLOS', '5493751376234'),
  ('iguazu', '83', 'GALEANO JUAN', '5493751565786')
ON CONFLICT (dc, foxtrot_driver_id) DO UPDATE SET
  nombre = EXCLUDED.nombre, phone_number = EXCLUDED.phone_number, activo = true, updated_at = now();

COMMIT;
