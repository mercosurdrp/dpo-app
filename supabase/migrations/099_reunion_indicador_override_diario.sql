-- =============================================
-- 099 · Reuniones · Override manual diario de indicadores
-- =============================================
-- Permite corregir hacia atrás en el tiempo ciertos indicadores del tablero
-- de la reunión de logística (Misiones) que normalmente vienen del scraper del
-- depósito o de la carga por reunión:
--   - Productividad de picking  (auto_productividad_picking)
--   - Errores de picking        (auto_errores_picking)
--   - Pérdidas                  (indicador manual, key = su indicador_id)
--
-- El override es por (indicador, fecha) y es GLOBAL del tenant (no atado a una
-- reunión), así desde la reunión de hoy se puede corregir el valor de cualquier
-- día pasado. Cuando hay override para una fecha, PISA el valor automático;
-- borrar el override (valor NULL → se elimina la fila) vuelve al automático.
--
-- `indicador_key` = el mismo id que usa la grilla (`ind.id`): para los auto es
-- el string fijo; para Pérdidas es el UUID del indicador de config.
--
-- Idempotente. RLS igual que reunion_apertura_picking (auth lee y escribe).
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS reunion_indicador_override_diario (
  indicador_key   text NOT NULL,
  fecha           date NOT NULL,
  valor           numeric(18,4),
  registrado_por  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (indicador_key, fecha)
);

CREATE INDEX IF NOT EXISTS idx_reunion_indicador_override_fecha
  ON reunion_indicador_override_diario(fecha);

ALTER TABLE reunion_indicador_override_diario ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado.
DROP POLICY IF EXISTS "reunion_indicador_override_select_auth" ON reunion_indicador_override_diario;
CREATE POLICY "reunion_indicador_override_select_auth"
  ON reunion_indicador_override_diario FOR SELECT TO authenticated
  USING (true);

-- Escritura: cualquier usuario autenticado (mismo criterio que
-- reuniones_indicadores_valores / reunion_apertura_picking; el control fino de
-- editor/asistente lo hace el server action).
DROP POLICY IF EXISTS "reunion_indicador_override_write_auth" ON reunion_indicador_override_diario;
CREATE POLICY "reunion_indicador_override_write_auth"
  ON reunion_indicador_override_diario FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- Reload schema cache de PostgREST (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
