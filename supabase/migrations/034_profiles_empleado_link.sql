-- =============================================
-- 034 · Link profiles → empleados
-- =============================================
-- Idempotent migration: adds optional FK from profiles.empleado_id to empleados.id.
-- Multi-tenant safe (runs against Pampeana + Distribuciones).
-- Re-running is a no-op thanks to IF NOT EXISTS guards.
-- =============================================

BEGIN;

-- Nullable FK. ON DELETE SET NULL so deleting an empleado doesn't orphan the user.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL;

-- Lookup index (FK queries, joins).
CREATE INDEX IF NOT EXISTS idx_profiles_empleado_id
  ON profiles(empleado_id);

-- Enforce 1:1 link: one empleado can be linked to at most one profile.
-- Partial index so multiple rows with NULL empleado_id remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_empleado_id_unique
  ON profiles(empleado_id)
  WHERE empleado_id IS NOT NULL;

COMMENT ON COLUMN profiles.empleado_id IS
  'FK opcional al empleado asociado a este usuario web';

COMMIT;
