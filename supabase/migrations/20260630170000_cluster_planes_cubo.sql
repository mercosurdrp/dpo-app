-- Plan de acción AGRUPADO por cubo del diagrama 3D de la clusterización.
-- Uno por cubo (cubo = PK ⇒ se reemplaza al volver a cargar). Complementa los
-- planes puntuales por cliente de `cluster_planes`.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cluster_planes_cubo (
  cubo         TEXT PRIMARY KEY,
  descripcion  TEXT NOT NULL,
  responsable  TEXT,
  fecha_limite DATE,
  estado       TEXT NOT NULL DEFAULT 'pendiente',
  created_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cluster_planes_cubo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cluster_planes_cubo_sel" ON public.cluster_planes_cubo;
CREATE POLICY "cluster_planes_cubo_sel" ON public.cluster_planes_cubo FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cluster_planes_cubo_ins" ON public.cluster_planes_cubo;
CREATE POLICY "cluster_planes_cubo_ins" ON public.cluster_planes_cubo FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cluster_planes_cubo_upd" ON public.cluster_planes_cubo;
CREATE POLICY "cluster_planes_cubo_upd" ON public.cluster_planes_cubo FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "cluster_planes_cubo_del" ON public.cluster_planes_cubo;
CREATE POLICY "cluster_planes_cubo_del" ON public.cluster_planes_cubo FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cluster_planes_cubo TO authenticated;
GRANT ALL ON public.cluster_planes_cubo TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
