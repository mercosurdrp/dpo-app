-- =============================================
-- Snapshots mensuales de KPIs de flota — /vehiculos/mantenimiento
-- Los KPIs "foto" (cumplimiento del plan, services vencidos) no tienen
-- histórico reconstruible: un cron diario pisa el valor del mes ARG en curso
-- y al cerrar el mes queda la última foto. Con eso el tablero de Indicadores
-- muestra tendencia de 3 meses para TODOS los KPIs (exigencia DPO pilar
-- Flota: "los PIs deben mostrar tendencia positiva en los últimos 3 meses").
-- Escrituras solo vía service role (cron): sin policies de INSERT/UPDATE.
-- =============================================

CREATE TABLE flota_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi TEXT NOT NULL,
  year INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kpi, year, mes)
);

CREATE INDEX idx_flota_kpi_snapshots_ym ON flota_kpi_snapshots(year, mes);

ALTER TABLE flota_kpi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flota_kpi_snapshots_read" ON flota_kpi_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER flota_kpi_snapshots_updated_at
  BEFORE UPDATE ON flota_kpi_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION flota_plan_set_updated_at();
