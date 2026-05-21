-- =============================================
-- Foxtrot: manifiesto de carga por ruta (lo que SALE a la calle)
-- =============================================
-- foxtrot_delivery_attempts solo guarda las deliveries que tuvieron al menos un
-- INTENTO (entregado/rechazado). Para la reunión de logística (Misiones) los
-- KPIs de bultos / HL / ocupación de bodega deben reflejar la CARGA del camión
-- al salir — esté entregada o no — y estar disponibles apenas la ruta arranca.
-- Esta tabla guarda TODAS las deliveries planificadas de cada ruta (manifiesto),
-- que Foxtrot expone aunque la parada todavía no se haya visitado.
-- El cruce a HL/CEq (Chess) se hace en lectura, por eso acá solo va nombre+cant.

CREATE TABLE IF NOT EXISTS foxtrot_route_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id TEXT NOT NULL REFERENCES foxtrot_routes(route_id) ON DELETE CASCADE,
  dc_id TEXT NOT NULL,
  fecha DATE NOT NULL,
  waypoint_id TEXT,
  delivery_id TEXT NOT NULL,
  delivery_name TEXT,
  quantity NUMERIC(10,2),
  last_synced TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_fox_routedel_route ON foxtrot_route_deliveries(route_id);
CREATE INDEX IF NOT EXISTS idx_fox_routedel_fecha ON foxtrot_route_deliveries(fecha);
CREATE INDEX IF NOT EXISTS idx_fox_routedel_dc ON foxtrot_route_deliveries(dc_id);

ALTER TABLE foxtrot_route_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fox_routedel_read" ON foxtrot_route_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "fox_routedel_all" ON foxtrot_route_deliveries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
