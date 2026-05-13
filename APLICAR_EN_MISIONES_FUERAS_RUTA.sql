-- =============================================================
-- INDICADOR "FUERAS DE RUTA" — MISIONES
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
--
-- Almacena snapshots de Chess (rutas + clientes con fuerza PRE vigente
-- + pedidos por rango de fecha de entrega) y expone una vista que
-- materializa el flag es_fuera_de_ruta cruzando el día de semana del
-- pedido contra los dias_visita_iso de la ruta del cliente.
-- =============================================================

-- ============= TABLA: chess_rutas_misiones =============
CREATE TABLE IF NOT EXISTS chess_rutas_misiones (
  id_ruta INT PRIMARY KEY,
  des_ruta TEXT,
  id_personal INT,
  des_personal TEXT,
  id_modo_atencion TEXT,
  -- ISO weekday: 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb, 7=Dom
  dias_visita_iso SMALLINT[] NOT NULL DEFAULT '{}',
  anulado BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chess_rutas_misiones_personal
  ON chess_rutas_misiones(id_personal);

ALTER TABLE chess_rutas_misiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chess_rutas_misiones_read_authenticated" ON chess_rutas_misiones;
CREATE POLICY "chess_rutas_misiones_read_authenticated"
  ON chess_rutas_misiones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chess_rutas_misiones_all_service" ON chess_rutas_misiones;
CREATE POLICY "chess_rutas_misiones_all_service"
  ON chess_rutas_misiones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============= TABLA: chess_clientes_ruta_misiones =============
CREATE TABLE IF NOT EXISTS chess_clientes_ruta_misiones (
  id_cliente INT PRIMARY KEY,
  id_ruta INT,
  fecha_inicio_fuerza DATE,
  razon_social TEXT,
  des_canal_mkt TEXT,
  des_localidad TEXT,
  calle_entrega TEXT,
  altura_entrega TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chess_clientes_ruta_misiones_ruta
  ON chess_clientes_ruta_misiones(id_ruta);

ALTER TABLE chess_clientes_ruta_misiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chess_clientes_ruta_misiones_read_authenticated" ON chess_clientes_ruta_misiones;
CREATE POLICY "chess_clientes_ruta_misiones_read_authenticated"
  ON chess_clientes_ruta_misiones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chess_clientes_ruta_misiones_all_service" ON chess_clientes_ruta_misiones;
CREATE POLICY "chess_clientes_ruta_misiones_all_service"
  ON chess_clientes_ruta_misiones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============= TABLA: chess_pedidos_misiones =============
-- PK compuesta (id_cliente, fecha_entrega): Chess /pedidos/?fechaEntrega=YYYY-MM-DD
-- no expone un id de pedido estable. Si un mismo cliente tiene varios pedidos
-- para la misma fecha, sumamos sus items en una sola fila.
CREATE TABLE IF NOT EXISTS chess_pedidos_misiones (
  id_cliente INT NOT NULL,
  fecha_entrega DATE NOT NULL,
  eliminado BOOLEAN NOT NULL DEFAULT false,
  id_deposito INT,
  items_total INT NOT NULL DEFAULT 0,
  items_no_anulados INT NOT NULL DEFAULT 0,
  unidades_total NUMERIC NOT NULL DEFAULT 0,
  monto_aprox NUMERIC NOT NULL DEFAULT 0,
  sync_run_id UUID,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_cliente, fecha_entrega)
);

CREATE INDEX IF NOT EXISTS idx_chess_pedidos_misiones_fecha
  ON chess_pedidos_misiones(fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_chess_pedidos_misiones_sync
  ON chess_pedidos_misiones(sync_run_id);

ALTER TABLE chess_pedidos_misiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chess_pedidos_misiones_read_authenticated" ON chess_pedidos_misiones;
CREATE POLICY "chess_pedidos_misiones_read_authenticated"
  ON chess_pedidos_misiones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chess_pedidos_misiones_all_service" ON chess_pedidos_misiones;
CREATE POLICY "chess_pedidos_misiones_all_service"
  ON chess_pedidos_misiones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============= TABLA: chess_sync_runs_misiones =============
-- Audit de los disparos del botón "Sincronizar período" (y futuros syncs
-- Chess on-demand de este proyecto).
CREATE TABLE IF NOT EXISTS chess_sync_runs_misiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL DEFAULT 'fueras_de_ruta',
  desde DATE NOT NULL,
  hasta DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- running | ok | error
  stats JSONB,
  error_msg TEXT,
  triggered_by UUID
);

CREATE INDEX IF NOT EXISTS idx_chess_sync_runs_misiones_modulo
  ON chess_sync_runs_misiones(modulo, started_at DESC);

ALTER TABLE chess_sync_runs_misiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chess_sync_runs_misiones_read_authenticated" ON chess_sync_runs_misiones;
CREATE POLICY "chess_sync_runs_misiones_read_authenticated"
  ON chess_sync_runs_misiones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chess_sync_runs_misiones_all_service" ON chess_sync_runs_misiones;
CREATE POLICY "chess_sync_runs_misiones_all_service"
  ON chess_sync_runs_misiones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============= VISTA: v_fueras_de_ruta_misiones =============
-- Cruza pedido → cliente → ruta y materializa es_fuera_de_ruta.
-- Postgres EXTRACT(ISODOW) devuelve 1=Lun..7=Dom; comparamos contra el
-- array dias_visita_iso de la ruta del cliente.
CREATE OR REPLACE VIEW v_fueras_de_ruta_misiones AS
SELECT
  p.id_cliente,
  p.fecha_entrega,
  p.eliminado,
  p.items_total,
  p.items_no_anulados,
  p.unidades_total,
  p.monto_aprox,
  p.synced_at,
  p.sync_run_id,
  c.razon_social,
  c.des_canal_mkt,
  c.des_localidad,
  c.calle_entrega,
  c.altura_entrega,
  c.id_ruta,
  r.des_ruta,
  r.id_personal,
  r.des_personal,
  r.dias_visita_iso,
  EXTRACT(ISODOW FROM p.fecha_entrega)::INT AS dow_iso_entrega,
  CASE
    WHEN c.id_ruta IS NULL THEN NULL
    WHEN r.dias_visita_iso IS NULL OR cardinality(r.dias_visita_iso) = 0 THEN NULL
    WHEN EXTRACT(ISODOW FROM p.fecha_entrega)::INT = ANY(r.dias_visita_iso) THEN false
    ELSE true
  END AS es_fuera_de_ruta
FROM chess_pedidos_misiones p
LEFT JOIN chess_clientes_ruta_misiones c ON c.id_cliente = p.id_cliente
LEFT JOIN chess_rutas_misiones r ON r.id_ruta = c.id_ruta;
