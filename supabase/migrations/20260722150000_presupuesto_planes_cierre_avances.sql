-- =============================================
-- Planes de Acción del Presupuesto · cierre trazable + bitácora de avances
-- =============================================
-- Complementa 135_presupuesto_planes_accion.sql. Dos huecos que tapa:
--
--   1) CIERRE. El estado 'cerrado' ya existía, pero solo se podía llegar
--      editando el plan y cambiando un select: no quedaba registro de
--      CUÁNDO ni QUIÉN cerró. Se agregan cerrado_at / cerrado_por, sellados
--      por trigger (mismo patrón que 101_portal_servicios_generales.sql).
--
--   2) SEGUIMIENTO DE AVANCES. Hoy cada paso tiene UNA columna `avance` de
--      texto que se pisa en cada edición: se ve el último avance y se pierde
--      la historia. Se agrega una bitácora append-only.
--
-- NO SE BORRA NADA:
--   · La columna `pasos.avance` se CONSERVA y se sigue manteniendo al día
--      (la app le escribe el último comentario). Todo lo que hoy lee esa
--      columna sigue funcionando igual.
--   · Los avances ya cargados se COPIAN a la bitácora (backfill, punto 3),
--      no se mueven.
-- =============================================

BEGIN;

-- =============================================
-- 1) Cierre trazable en la cabecera
-- =============================================
ALTER TABLE presupuestos_planes_accion
  ADD COLUMN IF NOT EXISTS cerrado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_por uuid REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN presupuestos_planes_accion.cerrado_at IS
  'Sellado automáticamente por trigger al pasar estado a cerrado/cancelado. Se limpia si el plan se reabre.';

-- Sella / limpia el cierre según el estado, venga de donde venga el UPDATE
-- (server action, SQL manual, Supabase Studio).
CREATE OR REPLACE FUNCTION presup_plan_accion_sellar_cierre()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado IN ('cerrado', 'cancelado')
     AND (OLD.estado IS DISTINCT FROM NEW.estado)
     AND NEW.cerrado_at IS NULL THEN
    NEW.cerrado_at := now();
  END IF;

  -- Reapertura: el plan vuelve a estar en curso ⇒ el cierre anterior ya no aplica.
  IF NEW.estado NOT IN ('cerrado', 'cancelado') THEN
    NEW.cerrado_at  := NULL;
    NEW.cerrado_por := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presup_plan_accion_sellar_cierre ON presupuestos_planes_accion;
CREATE TRIGGER trg_presup_plan_accion_sellar_cierre
  BEFORE UPDATE ON presupuestos_planes_accion
  FOR EACH ROW EXECUTE FUNCTION presup_plan_accion_sellar_cierre();


-- =============================================
-- 2) Bitácora de avances (append-only)
-- =============================================
-- paso_id NULL  ⇒ avance a nivel PLAN (incluye el comentario de cierre)
-- paso_id NOT NULL ⇒ avance de una acción puntual
CREATE TABLE IF NOT EXISTS presupuestos_planes_accion_avances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL
                REFERENCES presupuestos_planes_accion(id) ON DELETE CASCADE,
  paso_id     uuid REFERENCES presupuestos_planes_accion_pasos(id) ON DELETE CASCADE,
  comentario  text NOT NULL,
  -- Foto del estado del paso/plan en el momento del avance, para leer la
  -- evolución sin tener que cruzar con otra tabla.
  estado_snapshot text,
  -- 'avance'   → seguimiento normal
  -- 'cierre'   → comentario con el que se cerró el plan
  -- 'reapertura'
  -- 'backfill' → avance preexistente copiado por esta migración
  tipo        text NOT NULL DEFAULT 'avance'
                CHECK (tipo IN ('avance', 'cierre', 'reapertura', 'backfill')),
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_avances_plan
  ON presupuestos_planes_accion_avances(plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_presup_planes_accion_avances_paso
  ON presupuestos_planes_accion_avances(paso_id);


-- =============================================
-- 3) Backfill — COPIA (no mueve) los avances ya cargados
-- =============================================
-- created_at = updated_at del paso: es lo más cercano al momento real en que
-- se escribió ese avance. Idempotente: si la migración se re-corre, el
-- NOT EXISTS sobre tipo='backfill' evita duplicar.
INSERT INTO presupuestos_planes_accion_avances
  (plan_id, paso_id, comentario, estado_snapshot, tipo, created_by, created_at)
SELECT
  p.plan_id,
  p.id,
  p.avance,
  p.estado,
  'backfill',
  p.created_by,
  p.updated_at
FROM presupuestos_planes_accion_pasos p
WHERE p.avance IS NOT NULL
  AND btrim(p.avance) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM presupuestos_planes_accion_avances a
    WHERE a.paso_id = p.id AND a.tipo = 'backfill'
  );


-- =============================================
-- 4) RLS — misma política que las tablas hermanas
-- =============================================
ALTER TABLE presupuestos_planes_accion_avances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presup_planes_accion_avances_select_auth" ON presupuestos_planes_accion_avances;
CREATE POLICY "presup_planes_accion_avances_select_auth"
  ON presupuestos_planes_accion_avances FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presup_planes_accion_avances_write_editors" ON presupuestos_planes_accion_avances;
CREATE POLICY "presup_planes_accion_avances_write_editors"
  ON presupuestos_planes_accion_avances FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = (select auth.uid())
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = (select auth.uid())
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

GRANT ALL ON presupuestos_planes_accion_avances TO anon, authenticated, service_role;

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
