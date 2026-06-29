-- Gestión anticipada de rechazos en la reunión Ventas-Logística (vespertina).
-- Sobre la foto del Radar de Rechazos (clientes con entrega a +2 días), los
-- supervisores + jefe de venta repasan los clientes en riesgo por SIN DINERO /
-- CERRADO y registran, por cliente:
--   * el contacto al cliente con la captura del chat como EVIDENCIA de la reunión
--     (imagen en el bucket privado "reuniones", path radar-gestion/<reunion>/<cliente>/...),
--   * y, opcionalmente, el plan de acción que dispararon (FK a planes_accion).
-- Una fila por (reunión, cliente): se upsertea a medida que se gestiona.
CREATE TABLE IF NOT EXISTS reunion_radar_gestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  id_cliente bigint NOT NULL,
  nombre_cliente text,
  -- Motivo principal por el que está en riesgo (informativo): 'sin_dinero' | 'cerrado'.
  motivo text,
  -- Validación del mensaje enviado al cliente (captura del chat).
  contactado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  contactado_at timestamptz,
  foto_path text,
  foto_nombre text,
  -- Plan de acción puntual disparado para el cliente (cae en /planes).
  plan_id uuid REFERENCES planes_accion(id) ON DELETE SET NULL,
  notas text,
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reunion_id, id_cliente)
);

CREATE INDEX IF NOT EXISTS idx_reunion_radar_gestion_reunion
  ON reunion_radar_gestion(reunion_id);

ALTER TABLE reunion_radar_gestion ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado ve la gestión de la reunión.
CREATE POLICY "reunion_radar_gestion_read" ON reunion_radar_gestion
  FOR SELECT TO authenticated USING (true);

-- Escritura: solo admin / supervisor (incluye al Jefe de venta) / admin_rrhh.
CREATE POLICY "reunion_radar_gestion_write" ON reunion_radar_gestion
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
