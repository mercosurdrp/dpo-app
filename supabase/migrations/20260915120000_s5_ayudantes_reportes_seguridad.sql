-- Ranking de ayudantes de depósito: reportes de seguridad como cuarto
-- componente del score. Cuenta los reportes de tipo ACTO INSEGURO que el
-- operario cargó (autor = su usuario) en la ventana del ranking.
--   peso_reportes : peso del componente (se repondera con el resto).
--   tope_reportes : reportes POR MES que valen 100 pts (1,5/mes = 3 por
--                   bimestre). Se escala por los meses de la ventana.
-- La inelegibilidad por ausentismo NO tiene config: cualquier evento en
-- ausentismo_eventos dentro de la ventana deja al operario fuera del podio.
-- Solo aplica en Pampeana (Misiones no tiene s5_ayudantes_config).
ALTER TABLE s5_ayudantes_config
  ADD COLUMN IF NOT EXISTS peso_reportes NUMERIC NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS tope_reportes NUMERIC NOT NULL DEFAULT 1.5;
