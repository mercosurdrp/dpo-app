-- =============================================
-- Asistencia: marca manual de presente (admin)
-- Permite que admin/admin_rrhh marque presente a un empleado para días
-- en los que el reloj biométrico no funcionó. Conserva el origen para
-- distinguir de las fichadas reales. Aplicar a las DOS Supabase
-- (Pampeana + Misiones) — el código corre en ambos tenants.
-- =============================================

ALTER TABLE asistencia_marcas
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'biometrica'
    CHECK (origen IN ('biometrica','manual')),
  ADD COLUMN IF NOT EXISTS creado_por UUID,
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ;

-- Las marcas existentes (sync YAM) quedan como 'biometrica' por default.
-- El gating de quién puede insertar/borrar marcas manuales se hace en el
-- server action (requireRole(['admin','admin_rrhh'])), no por RLS, para
-- mantener compatibilidad con tenants que no tienen auth_role() ni el
-- enum user_role en el mismo formato (Misiones).
