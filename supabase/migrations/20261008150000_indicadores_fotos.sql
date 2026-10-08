-- =============================================
-- Fotos de cálculos pesados (Cuadro mensual, KPI de combustible)
-- =============================================
-- /presupuesto tardaba 10-15 s porque cada visita recalculaba el Cuadro
-- mensual de indicadores (8 tablas del año paginadas de a 1.000 filas, el SLA
-- de cada mes, la serie del depósito) y el KPI de viajes a Colón (vista de
-- Foxtrot con 4.000+ filas). Esos datos cambian una vez por día, con los
-- syncs de la madrugada.
--
-- Modelo: el resultado se guarda acá como "foto". La página lee la foto al
-- instante; si está vencida, el cliente pide recalcularla en segundo plano y
-- se refresca solo. Lectura y escritura sólo desde el servidor (service role):
-- no hay políticas de escritura para authenticated.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS indicadores_fotos (
  clave        text PRIMARY KEY,                  -- ej. 'cuadro-mensual', 'kpi-combustible-2026'
  datos        jsonb NOT NULL,
  generado_en  timestamptz NOT NULL DEFAULT now(),
  duracion_ms  int,                               -- cuánto tardó el cálculo (diagnóstico)
  generado_por uuid REFERENCES profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE indicadores_fotos IS
  'Resultados precalculados de cálculos pesados; se renuevan en segundo plano cuando vencen.';

ALTER TABLE indicadores_fotos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "indicadores_fotos_select_auth" ON indicadores_fotos;
CREATE POLICY "indicadores_fotos_select_auth"
  ON indicadores_fotos FOR SELECT TO authenticated USING (true);

GRANT SELECT ON indicadores_fotos TO authenticated;
GRANT ALL ON indicadores_fotos TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
