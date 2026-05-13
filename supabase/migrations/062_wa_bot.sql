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
