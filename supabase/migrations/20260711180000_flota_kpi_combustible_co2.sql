-- =============================================
-- KPIs de combustible (DPO Flota 3.3) y huella CO2 (DPO Flota 4.3) en el
-- tablero de Indicadores. Series calculadas de registro_combustible:
-- km/l ponderado del mes y litros × 2,68 kg CO2/l. Metas editables.
-- =============================================

INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('combustible_kml', NULL, '>=', 'km/l'),
  ('co2_flota', NULL, '<=', 'kg')
ON CONFLICT (kpi) DO NOTHING;
