-- =============================================
-- 037 · RRHH: roles supervisor + admin_rrhh, jerarquía y datos en empleados
-- =============================================
-- Multi-tenant safe (Pampeana + Misiones). Idempotente.
-- =============================================

BEGIN;

-- Nuevos valores del enum user_role.
-- ALTER TYPE ... ADD VALUE no admite IF NOT EXISTS dentro de una transacción
-- en versiones viejas de Postgres; la cláusula IF NOT EXISTS sí está soportada
-- en Postgres 14+ (Supabase usa 15+).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin_rrhh';

-- Extiende empleados con jerarquía y datos básicos de RRHH.
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS departamento TEXT,
  ADD COLUMN IF NOT EXISTS puesto TEXT,
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE,
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT, -- planta_permanente | plazo_fijo | eventual
  ADD COLUMN IF NOT EXISTS cuil TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS email_personal TEXT;

CREATE INDEX IF NOT EXISTS idx_empleados_supervisor ON empleados(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_empleados_area ON empleados(area);

COMMENT ON COLUMN empleados.supervisor_id IS 'FK al empleado que es supervisor directo';
COMMENT ON COLUMN empleados.tipo_contrato IS 'planta_permanente | plazo_fijo | eventual';

-- Función helper: empleado_id del usuario autenticado (lo usan RLS y actions).
CREATE OR REPLACE FUNCTION auth_empleado_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empleado_id FROM profiles WHERE id = auth.uid();
$$;

-- Función helper: rol del usuario autenticado.
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

COMMIT;
