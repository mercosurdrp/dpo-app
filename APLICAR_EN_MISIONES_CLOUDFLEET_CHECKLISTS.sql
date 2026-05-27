-- =============================================================
-- CLOUDFLEET · Checklists de flota (MISIONES)
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
-- =============================================================
-- Tabla espejo de los checklists (inspecciones) de Cloudfleet. La llena el
-- cron /api/cloudfleet/cron-sync + un refresh best-effort del día al abrir la
-- reunión de logística. De acá salen los indicadores Checks Aprobados,
-- Checks Rechazados, AE Aprobados y Adherencia a checks. SOLO Misiones.
-- `fecha` ya viene en hora ARG (checklistDate UTC − 3h). Idempotente.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cloudfleet_checklists (
  number       bigint PRIMARY KEY,        -- nº de checklist en Cloudfleet
  fecha        date NOT NULL,             -- checklistDate en hora ARG (date)
  tipo         text,                      -- type.name: LIBERACION / RETORNO / PREOPERACIONAL AE / ...
  vehicle_code text,                      -- vehicle.code: patente o TOYOTA4/5/6
  cost_center  text,                      -- costCenter.name: Eldorado / Iguazú / ...
  status       text,                      -- status.name: APROBADO / RECHAZADO / CRITICO
  qty_approved int,
  qty_rejected int,
  qty_critical int,
  qty_total    int,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cloudfleet_checklists_fecha ON cloudfleet_checklists(fecha);
CREATE INDEX IF NOT EXISTS idx_cloudfleet_checklists_tipo  ON cloudfleet_checklists(tipo);

ALTER TABLE cloudfleet_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfc_select_auth" ON cloudfleet_checklists;
CREATE POLICY "cfc_select_auth"
  ON cloudfleet_checklists FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cfc_all_service" ON cloudfleet_checklists;
CREATE POLICY "cfc_all_service"
  ON cloudfleet_checklists FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
