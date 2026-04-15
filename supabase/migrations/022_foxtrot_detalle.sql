-- =============================================
-- Foxtrot detalle: waypoints visitados + attempts de cada delivery
-- Permite ranking de clientes con más rechazos, SKUs fallados y motivos
-- =============================================

CREATE TABLE foxtrot_waypoints_visita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id TEXT NOT NULL REFERENCES foxtrot_routes(route_id) ON DELETE CASCADE,
  waypoint_id TEXT NOT NULL,
  customer_id TEXT,
  fecha DATE NOT NULL,
  status TEXT,
  completed_timestamp TIMESTAMPTZ,
  estimated_time_of_arrival TIMESTAMPTZ,
  waiting_time_seconds INTEGER,
  waypoints_ahead INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, waypoint_id)
);

CREATE INDEX idx_fox_wp_route ON foxtrot_waypoints_visita(route_id);
CREATE INDEX idx_fox_wp_customer ON foxtrot_waypoints_visita(customer_id);
CREATE INDEX idx_fox_wp_fecha ON foxtrot_waypoints_visita(fecha);
CREATE INDEX idx_fox_wp_status ON foxtrot_waypoints_visita(status);

CREATE TABLE foxtrot_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id TEXT NOT NULL REFERENCES foxtrot_routes(route_id) ON DELETE CASCADE,
  waypoint_id TEXT NOT NULL,
  customer_id TEXT,
  fecha DATE NOT NULL,
  delivery_id TEXT NOT NULL,
  delivery_name TEXT,
  delivery_quantity NUMERIC(10,2),
  attempt_id TEXT,
  attempt_status TEXT NOT NULL,
  attempt_timestamp TIMESTAMPTZ,
  driver_notes TEXT,
  delivery_code TEXT,
  delivery_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, attempt_id)
);

CREATE INDEX idx_fox_attempt_route ON foxtrot_delivery_attempts(route_id);
CREATE INDEX idx_fox_attempt_waypoint ON foxtrot_delivery_attempts(waypoint_id);
CREATE INDEX idx_fox_attempt_customer ON foxtrot_delivery_attempts(customer_id);
CREATE INDEX idx_fox_attempt_status ON foxtrot_delivery_attempts(attempt_status);
CREATE INDEX idx_fox_attempt_fecha ON foxtrot_delivery_attempts(fecha);

ALTER TABLE foxtrot_waypoints_visita ENABLE ROW LEVEL SECURITY;
ALTER TABLE foxtrot_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fox_wp_read" ON foxtrot_waypoints_visita FOR SELECT TO authenticated USING (true);
CREATE POLICY "fox_wp_all" ON foxtrot_waypoints_visita FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "fox_att_read" ON foxtrot_delivery_attempts FOR SELECT TO authenticated USING (true);
CREATE POLICY "fox_att_all" ON foxtrot_delivery_attempts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER fox_wp_updated_at
  BEFORE UPDATE ON foxtrot_waypoints_visita
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
