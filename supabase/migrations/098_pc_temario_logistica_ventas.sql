-- =============================================
-- 098 · Temario de la reunión Logística-Ventas (R2.1.5.3) con links editables
-- =============================================
-- Temario de la reunión semanal de logística-ventas, organizado en bloques
-- (de la lámina del manual): Avance comercial · Gestión de SKU · Nivel de
-- servicio · Gestión de clientes. Cada ítem puede tener un LINK editable a la
-- herramienta/análisis ya armado (frescura, rechazos, etc.) para entrar directo
-- en la reunión. Se muestra debajo del tablero de indicadores.
-- RLS patrón pc_*. Idempotente.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS pc_temario_items (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloque    TEXT NOT NULL,
  titulo    TEXT NOT NULL,
  url       TEXT,
  orden     INT  NOT NULL DEFAULT 0,
  activo    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_temario_items_orden ON pc_temario_items(orden);

-- Seed con los temas de la lámina (solo si la tabla está vacía)
INSERT INTO pc_temario_items (bloque, titulo, orden)
SELECT * FROM (VALUES
  ('Avance comercial', 'Avance y LE de ventas', 10),
  ('Avance comercial', 'Curva de ventas', 20),
  ('Avance comercial', 'Acciones comerciales', 30),
  ('Gestión de SKU', 'Stock de todos los negocios (DPO)', 110),
  ('Gestión de SKU', 'Frescura (DPO)', 120),
  ('Gestión de SKU', 'Retiros o plan de cargas', 130),
  ('Gestión de SKU', 'Agregar SKU críticos por cambios de estrategia', 140),
  ('Gestión de SKU', 'SKU uptime (productos con stock disponible en BEES)', 150),
  ('Nivel de servicio (DPO)', 'Inconvenientes de geolocalización y ventana horaria de clientes', 210),
  ('Nivel de servicio (DPO)', 'Rechazos', 220),
  ('Nivel de servicio (DPO)', 'Fuera de frecuencia (Flex Delivery)', 230),
  ('Nivel de servicio (DPO)', 'Seguimiento de tickets CXC', 240),
  ('Nivel de servicio (DPO)', 'NPS: Seguimiento de clientes detractores', 250),
  ('Nivel de servicio (DPO)', 'Rate my delivery (RMD)', 260),
  ('Nivel de servicio (DPO)', 'Cero Fallas (OTIF)', 270),
  ('Gestión de clientes', 'DS de envases y chapadur', 310),
  ('Gestión de clientes', 'Planillas pendientes', 320),
  ('Gestión de clientes', 'Priorización de futuras entregas', 330)
) AS v(bloque, titulo, orden)
WHERE NOT EXISTS (SELECT 1 FROM pc_temario_items);

DROP TRIGGER IF EXISTS trg_pc_temario_items_updated_at ON pc_temario_items;
CREATE TRIGGER trg_pc_temario_items_updated_at
  BEFORE UPDATE ON pc_temario_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pc_temario_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc_temario_items_read" ON pc_temario_items;
CREATE POLICY "pc_temario_items_read" ON pc_temario_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_temario_items_write" ON pc_temario_items;
CREATE POLICY "pc_temario_items_write" ON pc_temario_items FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','admin_rrhh','supervisor')));

COMMIT;

NOTIFY pgrst, 'reload schema';
