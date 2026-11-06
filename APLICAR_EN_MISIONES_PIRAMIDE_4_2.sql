-- DPO Flota 4.2 — Maintenance improvements & results (H1: 1/5).
--
-- Comentario del auditor: «Generar análisis aperturado de datos históricos.
-- Generar pirámide de mantenimientos».
--
--   1) Lectura MENSUAL de la pirámide (R4.2.3 «se realiza un seguimiento de los
--      resultados a lo largo del tiempo»): qué se leyó, qué se decidió, quién y
--      cuándo, con la foto de los números de ese momento. Hasta ahora el
--      análisis por sistema (correctivo_sistema_analisis) se pisaba y no
--      quedaba historia.
--   2) KPIs de la pirámide: % preventivo por CANTIDAD de OT (el de costo ya
--      existe) y MTBF de la flota.
--
-- Los planes sobre un foco de la pirámide NO necesitan esquema: son
-- flota_plan_accion con kpi = 'piramide:<tipo>:<valor>'.
--
-- Aplicar en el SQL editor de Supabase MISIONES. Idempotente.

-- 1) Lectura mensual de la pirámide ----------------------------------------------
CREATE TABLE IF NOT EXISTS flota_piramide_revision (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio                 INTEGER NOT NULL,
  mes                  INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  snapshot             JSONB NOT NULL DEFAULT '{}'::jsonb,
  lectura              TEXT NOT NULL,
  decision             TEXT,
  revisado_por         UUID REFERENCES profiles(id),
  revisado_por_nombre  TEXT,
  revisado_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);
COMMENT ON TABLE flota_piramide_revision IS
  'DPO Flota 4.2 / R4.2.3: lectura mensual de la pirámide de mantenimiento (roturas → correctivo → detección → preventivo). snapshot = niveles del mes y del acumulado del año + KPIs al momento de la lectura.';

ALTER TABLE flota_piramide_revision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flota_piramide_revision_read ON flota_piramide_revision;
CREATE POLICY flota_piramide_revision_read ON flota_piramide_revision
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS flota_piramide_revision_insert ON flota_piramide_revision;
CREATE POLICY flota_piramide_revision_insert ON flota_piramide_revision
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));
DROP POLICY IF EXISTS flota_piramide_revision_update ON flota_piramide_revision;
CREATE POLICY flota_piramide_revision_update ON flota_piramide_revision
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

-- 2) KPIs de la pirámide (R4.2.2 / R4.2.3) --------------------------------------
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('pct_preventivo_cant', 70, '>=', '%',
   'OT preventivas + proactivas sobre el total de OT del período, por CANTIDAD (pct_preventivo mide lo mismo por costo). Es el ancho de la base de la pirámide de mantenimiento contra la punta: con menos del 70 % de trabajo planificado la pirámide se invierte. Línea de base 2026 (Pampeana): ene-abr 77-95 %, may-jul 58-68 %, ago 29 %, sep 65 %, oct 53 %; acumulado ene-oct 65 %. Se cayó desde mayo y tocó fondo en agosto.'),
  ('mtbf_flota', NULL, '>=', 'días',
   'Tiempo medio entre fallas de la flota: días-unidad del período (unidades activas × días) ÷ OT correctivas (correctivo + rotura). Sube cuando el preventivo evita fallas. Línea de base ene-oct 2026 (Pampeana): ~69 días-unidad (14 unidades activas, 63 correctivas). Sin meta hasta cerrar 2026; la meta sale de esa base y de la pirámide.')
ON CONFLICT (kpi) DO NOTHING;

-- Verificación
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'flota_piramide_revision') AS tabla_revision,
  (SELECT count(*) FROM flota_metas WHERE kpi IN ('pct_preventivo_cant', 'mtbf_flota')) AS metas_2;
