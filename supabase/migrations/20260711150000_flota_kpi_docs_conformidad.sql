-- =============================================
-- KPI Conformidad documental (DPO Flota 1.1 R4/R5): % de unidades activas
-- sin requisitos legales de vehículo vencidos. Foto diaria vía cron
-- flota-kpi-cron (snapshot mensual). Meta semilla 100% (compliance).
-- =============================================

INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('docs_conformidad', 100, '>=', '%')
ON CONFLICT (kpi) DO NOTHING;
