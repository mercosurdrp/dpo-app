-- =============================================
-- 135 · Planes de Acción del Presupuesto
-- =============================================
-- Solapa nueva dentro del módulo /presupuesto (solo Pampeana).
-- Permite cargar un PLAN DE ACCIÓN para trabajar un desvío significativo
-- detectado en el análisis del presupuesto, opcionalmente colgado de una
-- TAREA de análisis existente (presupuestos_tareas), con una lista de
-- PASOS / acciones (estilo 5W2H) que tienen su propio estado y avance.
--
-- Modelo:
--   1) presupuestos_planes_accion        (cabecera: desvío + causa raíz)
--   2) presupuestos_planes_accion_pasos  (acciones/pasos con seguimiento)
--
-- Reusa: roles editores (admin / supervisor / admin_rrhh),
--        función update_updated_at().
-- =============================================

BEGIN;

-- =============================================
-- 1) Cabecera del plan de acción
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_planes_accion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio              int  NOT NULL,
  -- Vínculo opcional a la tarea de análisis de desvío que originó el plan.
  -- ON DELETE SET NULL: si se borra la tarea, el plan queda pero sin vínculo.
  tarea_id          uuid REFERENCES presupuestos_tareas(id) ON DELETE SET NULL,
  titulo            text NOT NULL,
  -- Descripción del desvío significativo a trabajar
  desvio_detectado  text,
  -- Análisis de causa raíz (el "por qué")
  causa_raiz        text,
  responsable_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_limite      date,
  estado            text NOT NULL DEFAULT 'abierto'
                      CHECK (estado IN (
                        'abierto',
                        'en_progreso',
                        'cerrado',
                        'cancelado'
                      )),
  observaciones     text,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_anio
  ON presupuestos_planes_accion(anio);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_tarea
  ON presupuestos_planes_accion(tarea_id);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_responsable
  ON presupuestos_planes_accion(responsable_id);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_estado
  ON presupuestos_planes_accion(estado);


-- =============================================
-- 2) Pasos / acciones del plan (5W2H + seguimiento)
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_planes_accion_pasos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL
                    REFERENCES presupuestos_planes_accion(id) ON DELETE CASCADE,
  orden           int  NOT NULL DEFAULT 0,
  que             text NOT NULL,          -- qué se va a hacer (What)
  como            text,                   -- cómo (How)
  responsable_id  uuid REFERENCES profiles(id) ON DELETE SET NULL, -- quién (Who)
  fecha_limite    date,                   -- cuándo (When)
  estado          text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_progreso', 'completado')),
  avance          text,                   -- comentario de avance / seguimiento
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_pasos_plan
  ON presupuestos_planes_accion_pasos(plan_id);


-- =============================================
-- 3) RLS
-- =============================================
ALTER TABLE presupuestos_planes_accion       ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos_planes_accion_pasos ENABLE ROW LEVEL SECURITY;

-- ---- presupuestos_planes_accion ----
DROP POLICY IF EXISTS "presup_planes_accion_select_auth" ON presupuestos_planes_accion;
CREATE POLICY "presup_planes_accion_select_auth"
  ON presupuestos_planes_accion FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presup_planes_accion_write_editors" ON presupuestos_planes_accion;
CREATE POLICY "presup_planes_accion_write_editors"
  ON presupuestos_planes_accion FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

-- ---- presupuestos_planes_accion_pasos ----
DROP POLICY IF EXISTS "presup_planes_accion_pasos_select_auth" ON presupuestos_planes_accion_pasos;
CREATE POLICY "presup_planes_accion_pasos_select_auth"
  ON presupuestos_planes_accion_pasos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presup_planes_accion_pasos_write_editors" ON presupuestos_planes_accion_pasos;
CREATE POLICY "presup_planes_accion_pasos_write_editors"
  ON presupuestos_planes_accion_pasos FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );


-- =============================================
-- 4) GRANTs explícitos (cache PostgREST)
-- =============================================
GRANT ALL ON presupuestos_planes_accion       TO anon, authenticated, service_role;
GRANT ALL ON presupuestos_planes_accion_pasos TO anon, authenticated, service_role;


-- =============================================
-- 5) Triggers updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_presup_planes_accion_updated_at ON presupuestos_planes_accion;
CREATE TRIGGER trg_presup_planes_accion_updated_at
  BEFORE UPDATE ON presupuestos_planes_accion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_presup_planes_accion_pasos_updated_at ON presupuestos_planes_accion_pasos;
CREATE TRIGGER trg_presup_planes_accion_pasos_updated_at
  BEFORE UPDATE ON presupuestos_planes_accion_pasos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
