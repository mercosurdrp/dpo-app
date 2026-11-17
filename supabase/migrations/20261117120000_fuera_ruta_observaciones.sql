-- =============================================
-- Fuera de ruta · Observaciones por día — 17/11/2026
--
-- Sebastián pidió, en la página de Fuera de ruta de Priorización de entrega,
-- un semáforo por día estilo SLA (¿hicimos fuera de ruta ese día o no?) y
-- poder dejar una observación que JUSTIFIQUE el día (feriado, pedido de
-- ventas, reestructuración de rutas, día pactado desactualizado en Chess…).
-- Un día con fuera de ruta y una observación que justifica pasa de rojo a
-- ámbar, como el "Cumple con excepción" del SLA.
--
-- Las acciones NO van acá: viven en planes_accion (punto 3.3 Planeamiento)
-- con `fuera_ruta_fecha=YYYY-MM-DD` en notas, así aparecen en /planes.
--
-- Idempotente.
-- =============================================

CREATE TABLE IF NOT EXISTS fuera_ruta_observaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  -- feriado | pedido_ventas | reestructuracion | dia_pactado | operativo | otro
  motivo text NOT NULL,
  texto text NOT NULL,
  -- true = el día queda justificado (ámbar); false = sólo una nota (sigue rojo)
  justifica boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fuera_ruta_observaciones_fecha_idx
  ON fuera_ruta_observaciones (fecha);

DROP TRIGGER IF EXISTS trg_fuera_ruta_observaciones_updated_at ON fuera_ruta_observaciones;
CREATE TRIGGER trg_fuera_ruta_observaciones_updated_at
  BEFORE UPDATE ON fuera_ruta_observaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fuera_ruta_observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fuera_ruta_observaciones_read" ON fuera_ruta_observaciones;
CREATE POLICY "fuera_ruta_observaciones_read"
  ON fuera_ruta_observaciones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "fuera_ruta_observaciones_write" ON fuera_ruta_observaciones;
CREATE POLICY "fuera_ruta_observaciones_write"
  ON fuera_ruta_observaciones
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor', 'admin_rrhh')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor', 'admin_rrhh')
  ));
