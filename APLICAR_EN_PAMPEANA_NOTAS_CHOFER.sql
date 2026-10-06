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

-- Choferes de Pampeana (Foxtrot, rutas en los últimos 30 días al 06/10/2026).
-- Sin WhatsApp todavía: Cordone Luis y Corrales Mauricio (Pergamino).
INSERT INTO bot_choferes_wa (dc, foxtrot_driver_id, nombre, phone_number)
VALUES
  ('ramallo', '5', 'ESCOBAR ROBERTO', '5493364637954'),
  ('ramallo', '1', 'RIVERO LAUREANO', '5493364407816'),
  ('ramallo', '20', 'RIVERO FEDERICO', '5493364104445'),
  ('ramallo', '19', 'ACOSTA JOEL', '5493364220860'),
  ('ramallo', '8', 'RIVERO EZEQUIEL', '5493364406680'),
  ('ramallo', '10', 'SANDOVAL ANTONIO', '5493364219217'),
  ('ramallo', '12', 'SEQUEIRA HUMBERTO', '5493364222529'),
  ('ramallo', '17', 'CERBIN ADRIAN EUCEBIO', '5493402533526'),
  ('pergamino', '36', 'FRIAS ANGEL', '5493364215497'),
  ('pergamino', '11', 'CERBIN ADRIAN', '5493402533526')
ON CONFLICT (dc, foxtrot_driver_id) DO UPDATE SET
  nombre = EXCLUDED.nombre, phone_number = EXCLUDED.phone_number, activo = true, updated_at = now();

COMMIT;
