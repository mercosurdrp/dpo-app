-- =============================================
-- Historial de intentos de examen por empleado/capacitación
-- =============================================

CREATE TABLE examen_intentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacitacion_id UUID NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  intento_n INT NOT NULL,
  nota INT NOT NULL,
  correctas INT,
  total INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(capacitacion_id, empleado_id, intento_n)
);

CREATE INDEX idx_examen_intentos_cap_emp ON examen_intentos(capacitacion_id, empleado_id);
CREATE INDEX idx_examen_intentos_created_at ON examen_intentos(created_at DESC);

-- =============================================
-- Backfill: cada asistencia con nota se carga como intento 1
-- (no tenemos correctas/total históricos: quedan NULL)
-- =============================================
INSERT INTO examen_intentos (capacitacion_id, empleado_id, intento_n, nota, correctas, total, created_at)
SELECT a.capacitacion_id, a.empleado_id, 1, a.nota, NULL, NULL, COALESCE(a.updated_at, a.created_at, now())
FROM asistencias a
WHERE a.nota IS NOT NULL;

-- =============================================
-- RLS
-- =============================================
ALTER TABLE examen_intentos ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a authenticated (igual que asistencias)
CREATE POLICY "examen_intentos_read"
  ON examen_intentos FOR SELECT TO authenticated USING (true);

-- Insert: el empleado puede insertar solo sus propios intentos
CREATE POLICY "examen_intentos_insert_self"
  ON examen_intentos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM empleados e
      WHERE e.id = examen_intentos.empleado_id
        AND e.profile_id = auth.uid()
    )
  );

-- Delete: solo admin (limpieza manual)
CREATE POLICY "examen_intentos_delete_admin"
  ON examen_intentos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
