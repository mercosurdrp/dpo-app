-- DPO Flota 2.4 — Mantenimiento correctivo (H1: 1/5).
--
-- Lo que el auditor marcó: «falta seguimiento de los correctivos INTERNOS;
-- mapearlos cuando un check sale NO OK y sumar la OT para cerrar el círculo con
-- el descuento de stock; análisis de incidencias aperturado; KPI y PDA».
--
--   1) Las OT internas que nacen del plan de acción del checklist llevan
--      origen = 'checklist' (antes sólo manual / cloudfleet).
--   2) Análisis de incidencias: conclusión y plan de acción por SISTEMA
--      (misma idea que checklist_item_analisis para los ítems del checklist).
--   3) KPIs del correctivo que el requisito nombra: rechazos por rotura de
--      flota, roturas de flota y tiempo de servicio en taller.
--
-- Aplicar en el SQL editor de Supabase PAMPEANA. Idempotente.
-- Después: APLICAR_EN_PAMPEANA_OT_INTERNAS_BACKFILL.sql (revisado).

-- 1) Origen 'checklist' en la OT -------------------------------------------------
ALTER TABLE mantenimiento_realizados DROP CONSTRAINT IF EXISTS mantenimiento_realizados_origen_check;
ALTER TABLE mantenimiento_realizados ADD CONSTRAINT mantenimiento_realizados_origen_check
  CHECK (origen IN ('manual', 'cloudfleet', 'checklist'));
COMMENT ON COLUMN mantenimiento_realizados.origen IS
  'manual = cargada a mano · cloudfleet = sync · checklist = OT interna creada al resolver el plan de acción de un ítem NO OK (correctivo interno, R2.4.1).';

-- 2) Análisis de incidencias por sistema (R2.4.2) -------------------------------
CREATE TABLE IF NOT EXISTS correctivo_sistema_analisis (
  sistema      TEXT PRIMARY KEY,
  observacion  TEXT,
  plan_accion  TEXT,
  plan_estado  TEXT CHECK (plan_estado IS NULL OR plan_estado IN ('en_curso', 'cerrado')),
  plan_at      TIMESTAMPTZ,
  plan_by      UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID
);
COMMENT ON TABLE correctivo_sistema_analisis IS
  'DPO Flota 2.4 / R2.4.2: por cada sistema del vehículo, la conclusión escrita del análisis de correctivos y la acción de fondo tomada (la contramedida, distinta del plan de cada OT).';

ALTER TABLE correctivo_sistema_analisis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS correctivo_sistema_analisis_read ON correctivo_sistema_analisis;
CREATE POLICY correctivo_sistema_analisis_read ON correctivo_sistema_analisis
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS correctivo_sistema_analisis_write ON correctivo_sistema_analisis;
CREATE POLICY correctivo_sistema_analisis_write ON correctivo_sistema_analisis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) KPIs del correctivo (R2.4.3) --------------------------------------------------
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('rechazos_rotura_flota', 2, '<=', '#',
   'Rechazos de entrega con motivo "ROTURA DE CAMION - SINIESTRO" en el mes (tabla rechazos, fuente Chess). Es el KPI que el R2.4.3 nombra textual —"nº de rechazos por rotura de flota"— y el que conecta el correctivo con el nivel de servicio: cada evento es un cliente que no recibió por una falla del camión. Línea de base 2026: mar 1, ago 1, sep 5, oct 20 (el salto de octubre se analiza en el 5 Porqués del OJA403 y en la pirámide). Meta 2 eventos/mes: admite una rotura súbita en ruta, no una racha.'),
  ('roturas_flota', 1, '<=', '#',
   'OT correctivas del mes que dejaron la unidad parada al menos un día o requirieron auxilio en ruta: la "avería" de la pirámide de fallas, que es lo que el R2.4.3 llama "nº de roturas de flota". Se cuenta por OT con fuera_servicio o auxilio_ruta. Línea de base 2026: abr 1 (TOYOTA3 149 d), jun 2, jul 4 (OJA403 ×3, AF469UR), ago-oct 0-1. Meta 1/mes: una rotura es operación; dos es patrón.'),
  ('correctivo_tiempo_servicio', NULL, '<=', 'horas',
   'Horas promedio entre la entrada y la salida del taller de las OT correctivas del mes (entrada_taller / salida_taller de la OT). Es el "tiempo de servicio" del R2.4.3 y mide al proveedor tanto como a la falla: sirve para el ANS con los talleres. Sin meta hasta tener tres meses con entrada y salida cargadas en todas las correctivas; la meta sale de ahí y del ANS firmado.')
ON CONFLICT (kpi) DO NOTHING;

-- Verificación
SELECT
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'mantenimiento_realizados_origen_check') AS origen_check,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'correctivo_sistema_analisis') AS tabla_analisis,
  (SELECT count(*) FROM flota_metas WHERE kpi IN ('rechazos_rotura_flota', 'roturas_flota', 'correctivo_tiempo_servicio')) AS metas_3;
