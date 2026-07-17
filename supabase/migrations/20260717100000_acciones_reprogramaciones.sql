-- =============================================
-- Acciones de auditoría · Log de reprogramaciones
-- =============================================
-- Hasta ahora cerrar una acción era cambiar el estado en un dropdown y
-- reprogramarla era pisar fecha_limite sin dejar rastro. Esta migración
-- agrega acciones_reprogramaciones (mismo modelo que plan_reprogramaciones,
-- migración 035) para que cada corrimiento de fecha quede registrado con
-- fecha anterior/nueva, motivo y autor.
--
-- Idempotente. NOTIFY pgrst al final fuera de transacción.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS acciones_reprogramaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accion_id UUID NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  fecha_anterior DATE,
  fecha_nueva DATE NOT NULL,
  motivo TEXT,
  reprogramado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reprogramado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acciones_reprogramaciones_accion
  ON acciones_reprogramaciones(accion_id);

ALTER TABLE acciones_reprogramaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acciones_reprogramaciones_read"
  ON acciones_reprogramaciones;
CREATE POLICY "acciones_reprogramaciones_read"
  ON acciones_reprogramaciones FOR SELECT TO authenticated
  USING (true);

-- Mismos roles que pueden escribir acciones (001_initial_schema)
DROP POLICY IF EXISTS "acciones_reprogramaciones_insert"
  ON acciones_reprogramaciones;
CREATE POLICY "acciones_reprogramaciones_insert"
  ON acciones_reprogramaciones FOR INSERT TO authenticated
  WITH CHECK (
    reprogramado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'auditor')
    )
  );

GRANT ALL ON acciones_reprogramaciones
  TO anon, authenticated, service_role;

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
