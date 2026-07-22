-- Reuniones — snapshot del dimensionamiento comunicado en la reunión (SOLO Pampeana)
--
-- Cierra el R2.3.4 del punto DPO Planeamiento 2.3: el dimensionamiento tiene que
-- COMUNICARSE a los equipos de almacén y entrega dentro del mes de la ejecución.
-- La reunión de Logística del último día hábil del mes pasa a tener una sección
-- con el cuadro resumen por sector.
--
-- Por qué un snapshot y no leer en vivo: el módulo de dimensionamiento siempre
-- calcula con el mes EN CURSO. Si en octubre alguien abre la reunión de julio,
-- sin snapshot vería números de octubre y la evidencia de auditoría no serviría.
-- El snapshot congela lo que se comunicó ese día. Es 1 fila por reunión.

BEGIN;

CREATE TABLE IF NOT EXISTS reunion_dimensionamiento_snapshots (
  reunion_id  uuid PRIMARY KEY REFERENCES reuniones(id) ON DELETE CASCADE,
  datos       jsonb NOT NULL,           -- resumen por sector, ver getResumenDimensionamiento()
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reunion_dimensionamiento_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rds_select ON public.reunion_dimensionamiento_snapshots;
DROP POLICY IF EXISTS rds_insert ON public.reunion_dimensionamiento_snapshots;
DROP POLICY IF EXISTS rds_update ON public.reunion_dimensionamiento_snapshots;
DROP POLICY IF EXISTS rds_delete ON public.reunion_dimensionamiento_snapshots;

CREATE POLICY rds_select ON public.reunion_dimensionamiento_snapshots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rds_insert ON public.reunion_dimensionamiento_snapshots
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])));
CREATE POLICY rds_update ON public.reunion_dimensionamiento_snapshots
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])));
CREATE POLICY rds_delete ON public.reunion_dimensionamiento_snapshots
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])));

COMMIT;
