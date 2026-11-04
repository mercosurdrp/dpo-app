-- Ranking de ayudantes de Depósito: errores de picking cada 1.000 bultos.
-- Pedido del 04/11/2026: el componente "errores" compara a operarios que
-- pickearon distinta cantidad de días, así que pasa a ser una tasa
-- (errores / bultos pickeados × 1.000, bultos del blob bultos-picking-operario
-- del tablero de depósito) en vez del conteo absoluto.
--   tope_errores_x1000  : errores cada 1.000 bultos (en la ventana) que valen
--                         0 pts. No se escala por meses: es una tasa. 2 c/1.000
--                         equivale a los 50/mes del tope absoluto con ~20.000
--                         bultos por mes.
--   errores_x1000_desde : primer período (periodo_desde del ranking) que se
--                         califica por tasa. Los anteriores siguen por conteo
--                         para no mover podios ya entregados. NULL = nunca.
--                         Arranca en sep-oct 2026: con tope 2 el podio de ese
--                         bimestre queda igual que con el conteo.
-- Se incluye también lo de 20260915120000 (reportes de seguridad) porque al
-- 04/11/2026 esa migración no estaba aplicada en Pampeana (el código usaba
-- los defaults y "Guardar fórmula" fallaba con 42703).
-- Solo aplica en Pampeana (Misiones no tiene s5_ayudantes_config).
ALTER TABLE s5_ayudantes_config
  ADD COLUMN IF NOT EXISTS peso_reportes NUMERIC NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS tope_reportes NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS tope_errores_x1000 NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS errores_x1000_desde DATE DEFAULT '2026-09-01';

COMMENT ON COLUMN s5_ayudantes_config.tope_errores_x1000 IS
  'Errores de picking cada 1.000 bultos pickeados (en la ventana) que valen 0 pts';
COMMENT ON COLUMN s5_ayudantes_config.errores_x1000_desde IS
  'Primer período del ranking calificado por errores cada 1.000 bultos; los anteriores usan el conteo absoluto';
