-- =============================================
-- Participación cruzada Ventas ↔ Operaciones (pilar Planeamiento)
-- =============================================
-- El punto pide que Ventas y Operaciones participen de las reuniones del otro
-- y que quede evidencia. Una sola tabla cubre los dos casos:
--
--  a) PLANIFICADA: se programa la fecha (mensual o quincenal, alternando el
--     sentido) y queda 'programada' hasta que se cumple.
--  b) REALIZADA: se marca con foto, quiénes participaron y una minuta breve.
--     Si pasó en una reunión que vive en la app (Warehouse, Matinal, etc.) se
--     ata a esa reunión con `reunion_id` y la reunión queda identificada; si
--     pasó en una reunión de Ventas (que no está en dpo-app), `reunion_id`
--     queda NULL y la evidencia es la foto + la minuta.
--
-- Las fotos van al bucket privado `reuniones`, bajo `cruces/<id>/...`.
-- =============================================

CREATE TABLE IF NOT EXISTS participaciones_cruzadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Plan
  fecha_plan DATE,
  sentido TEXT NOT NULL
    CHECK (sentido IN ('ventas_a_operaciones', 'operaciones_a_ventas')),
  destino TEXT,                       -- a qué reunión va (texto libre)
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Cumplimiento
  estado TEXT NOT NULL DEFAULT 'programada'
    CHECK (estado IN ('programada', 'realizada', 'no_realizada')),
  fecha_real DATE,
  reunion_id UUID REFERENCES reuniones(id) ON DELETE SET NULL,
  participantes TEXT,                 -- quiénes participaron
  minuta TEXT,                        -- qué se habló
  motivo TEXT,                        -- por qué no se hizo
  fotos TEXT[] NOT NULL DEFAULT '{}', -- paths en el bucket `reuniones`

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una reunión de la app no puede quedar marcada dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_participaciones_cruzadas_reunion
  ON participaciones_cruzadas(reunion_id)
  WHERE reunion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participaciones_cruzadas_fecha
  ON participaciones_cruzadas(coalesce(fecha_real, fecha_plan) DESC);

-- Una realizada tiene que decir CUÁNDO pasó; una programada, cuándo se espera.
ALTER TABLE participaciones_cruzadas
  DROP CONSTRAINT IF EXISTS chk_participaciones_cruzadas_fechas;
ALTER TABLE participaciones_cruzadas
  ADD CONSTRAINT chk_participaciones_cruzadas_fechas CHECK (
    (estado = 'realizada' AND fecha_real IS NOT NULL)
    OR (estado <> 'realizada' AND fecha_plan IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION participaciones_cruzadas_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participaciones_cruzadas_touch ON participaciones_cruzadas;
CREATE TRIGGER trg_participaciones_cruzadas_touch
  BEFORE UPDATE ON participaciones_cruzadas
  FOR EACH ROW EXECUTE FUNCTION participaciones_cruzadas_touch();

-- =============================================
-- RLS: mismo criterio que el resto del módulo de reuniones
--   - lee cualquier usuario autenticado
--   - escriben admin / supervisor / admin_rrhh
-- =============================================
ALTER TABLE participaciones_cruzadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participaciones_cruzadas_select_auth ON participaciones_cruzadas;
CREATE POLICY participaciones_cruzadas_select_auth
  ON participaciones_cruzadas FOR SELECT
  USING (true);

DROP POLICY IF EXISTS participaciones_cruzadas_write_editors ON participaciones_cruzadas;
CREATE POLICY participaciones_cruzadas_write_editors
  ON participaciones_cruzadas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])
    )
  );
