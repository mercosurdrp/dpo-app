-- Plan de acción AGRUPADO por frente estratégico del cruce Clusterización ×
-- Censo Thomas (solapa "Mercado"). Uno por frente (frente = PK ⇒ se reemplaza
-- al volver a cargar). Mismo patrón que `cluster_planes_cubo`.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cluster_planes_frente (
  frente       TEXT PRIMARY KEY,
  descripcion  TEXT NOT NULL,
  responsable  TEXT,
  fecha_limite DATE,
  estado       TEXT NOT NULL DEFAULT 'pendiente',
  created_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cluster_planes_frente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cluster_planes_frente_sel" ON public.cluster_planes_frente;
CREATE POLICY "cluster_planes_frente_sel" ON public.cluster_planes_frente FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cluster_planes_frente_ins" ON public.cluster_planes_frente;
CREATE POLICY "cluster_planes_frente_ins" ON public.cluster_planes_frente FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cluster_planes_frente_upd" ON public.cluster_planes_frente;
CREATE POLICY "cluster_planes_frente_upd" ON public.cluster_planes_frente FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "cluster_planes_frente_del" ON public.cluster_planes_frente;
CREATE POLICY "cluster_planes_frente_del" ON public.cluster_planes_frente FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cluster_planes_frente TO authenticated;
GRANT ALL ON public.cluster_planes_frente TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
