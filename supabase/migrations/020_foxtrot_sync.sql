-- =============================================
-- Foxtrot API sync — Pilar Entrega 1.2 R1.2.4, R1.2.5, R1.2.6
-- Snapshot local de rutas, localizaciones y logs de sync
-- =============================================

-- Rutas del día importadas desde Foxtrot
CREATE TABLE foxtrot_routes (
  route_id TEXT PRIMARY KEY,
  dc_id TEXT NOT NULL,
  fecha DATE NOT NULL,
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  vehicle_id TEXT,
  dominio TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  completion_type TEXT,
  is_active BOOLEAN,
  is_finalized BOOLEAN,
  total_waypoints INTEGER NOT NULL DEFAULT 0,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  deliveries_successful INTEGER NOT NULL DEFAULT 0,
  deliveries_failed INTEGER NOT NULL DEFAULT 0,
  deliveries_visit_later INTEGER NOT NULL DEFAULT 0,
  deliveries_attempted INTEGER NOT NULL DEFAULT 0,
  tiempo_ruta_minutos INTEGER,
  driver_click_score NUMERIC(5,2),
  adherencia_secuencia NUMERIC(5,2),
  pct_tracking_activo NUMERIC(5,2),
  raw_data JSONB,
  last_synced TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foxtrot_routes_fecha ON foxtrot_routes(fecha);
CREATE INDEX idx_foxtrot_routes_driver ON foxtrot_routes(driver_id);
CREATE INDEX idx_foxtrot_routes_dominio ON foxtrot_routes(dominio);

-- Posiciones GPS (último snapshot + histórico corto)
CREATE TABLE foxtrot_driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  fecha DATE NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  latitud DOUBLE PRECISION NOT NULL,
  longitud DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, timestamp)
);

CREATE INDEX idx_foxtrot_loc_driver ON foxtrot_driver_locations(driver_id);
CREATE INDEX idx_foxtrot_loc_fecha ON foxtrot_driver_locations(fecha);

-- Mapeo Foxtrot driver → empleado local
CREATE TABLE foxtrot_driver_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foxtrot_driver_id TEXT NOT NULL UNIQUE,
  foxtrot_driver_name TEXT NOT NULL,
  empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foxtrot_map_empleado ON foxtrot_driver_mapping(empleado_id);

-- Log de sincronizaciones
CREATE TABLE foxtrot_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  fecha DATE NOT NULL,
  rutas_sincronizadas INTEGER NOT NULL DEFAULT 0,
  posiciones_sincronizadas INTEGER NOT NULL DEFAULT 0,
  errores INTEGER NOT NULL DEFAULT 0,
  error_detalle TEXT,
  ok BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_foxtrot_sync_log_fecha ON foxtrot_sync_log(fecha);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE foxtrot_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE foxtrot_driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE foxtrot_driver_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE foxtrot_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foxtrot_routes_read" ON foxtrot_routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "foxtrot_routes_all" ON foxtrot_routes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "foxtrot_loc_read" ON foxtrot_driver_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "foxtrot_loc_all" ON foxtrot_driver_locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "foxtrot_map_read" ON foxtrot_driver_mapping FOR SELECT TO authenticated USING (true);
CREATE POLICY "foxtrot_map_all" ON foxtrot_driver_mapping FOR ALL TO authenticated USING (true);

CREATE POLICY "foxtrot_sync_read" ON foxtrot_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "foxtrot_sync_all" ON foxtrot_sync_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Triggers updated_at
CREATE TRIGGER foxtrot_routes_updated_at
  BEFORE UPDATE ON foxtrot_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER foxtrot_map_updated_at
  BEFORE UPDATE ON foxtrot_driver_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
