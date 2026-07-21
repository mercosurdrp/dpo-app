-- Dimensionamiento — costo de la hora-hombre extra por sector (SOLO Pampeana)
--
-- Cierra el punto DPO Planeamiento 2.3 / R2.3.5: la herramienta de dimensionamiento
-- tiene que mostrar el impacto FINANCIERO de la estructura, no solo la estructura.
-- Con esto, las horas-hombre extra que ya proyecta el módulo se valorizan y se
-- traducen a $/HL incremental, comparable contra el VLC/HL del Árbol del Sueño.
--
-- Fuente de los valores: EERR PxQ MRP 2026 (bucket `presupuestos`), hojas
-- `ALMACEN PXQ mrp` (fila «P Horas Extras») y `ENTREGA PXQ mrp` (fila «p» del
-- bloque HORAS EXTRAS). Son valores PRESUPUESTADOS de hora extra —el recargo
-- 50%/100% ya viene incluido— con 2% de inflación mensual compuesta.
-- Editables desde la UI: si el valor real de liquidación difiere, se pisa acá.
--
-- `horas_vuelta_extra` traduce los días de refuerzo de flota (que el modelo
-- calcula en días, no en horas) a hora-hombre: cada persona que falta en un día
-- de refuerzo hace esta cantidad de horas extra. Default 4 h = media jornada,
-- que es lo que dura una 2ª vuelta corta.

BEGIN;

CREATE TABLE IF NOT EXISTS dim_costo_hh (
  anio             integer NOT NULL,
  mes              integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  costo_hh_almacen numeric(12,2) NOT NULL DEFAULT 0,  -- $/hora extra, sector almacén
  costo_hh_entrega numeric(12,2) NOT NULL DEFAULT 0,  -- $/hora extra, sector entrega/distribución
  updated_by       uuid REFERENCES auth.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes)
);

ALTER TABLE dim_costo_hh ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dim_costo_hh_select ON public.dim_costo_hh;
DROP POLICY IF EXISTS dim_costo_hh_insert ON public.dim_costo_hh;
DROP POLICY IF EXISTS dim_costo_hh_update ON public.dim_costo_hh;
DROP POLICY IF EXISTS dim_costo_hh_delete ON public.dim_costo_hh;

CREATE POLICY dim_costo_hh_select ON public.dim_costo_hh
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dim_costo_hh_insert ON public.dim_costo_hh
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])));
CREATE POLICY dim_costo_hh_update ON public.dim_costo_hh
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])));
CREATE POLICY dim_costo_hh_delete ON public.dim_costo_hh
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor', 'admin_rrhh'])));

-- Seed 2026 (EERR PxQ MRP, junio 2026)
INSERT INTO dim_costo_hh (anio, mes, costo_hh_almacen, costo_hh_entrega) VALUES
  (2026,  1, 7000.00, 7291.98),
  (2026,  2, 7140.00, 7437.82),
  (2026,  3, 7282.80, 7586.58),
  (2026,  4, 7428.46, 7738.31),
  (2026,  5, 7577.03, 7893.07),
  (2026,  6, 7728.57, 8050.94),
  (2026,  7, 7883.14, 8211.95),
  (2026,  8, 8040.80, 8376.19),
  (2026,  9, 8201.62, 8543.72),
  (2026, 10, 8365.65, 8714.59),
  (2026, 11, 8532.96, 8888.88),
  (2026, 12, 8703.62, 9066.66)
ON CONFLICT (anio, mes) DO NOTHING;

-- Horas extra por persona en un día de refuerzo de flota (traduce días → hora-hombre)
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS horas_vuelta_extra numeric(5,2) NOT NULL DEFAULT 4;

COMMIT;
