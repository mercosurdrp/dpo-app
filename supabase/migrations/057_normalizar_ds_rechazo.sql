-- =====================================================================
-- 057_normalizar_ds_rechazo.sql
-- Pampeana — normaliza ds_rechazo truncados (Chess limita a 20 chars).
-- Idempotente: cada UPDATE filtra por id_rechazo + texto antiguo.
-- =====================================================================
-- El join entre rechazos y catalogo_rechazos es por id_rechazo numérico
-- (ver computeAggMotivo en src/lib/rechazos/comparado.ts), por lo que el
-- UPDATE solo afecta el DISPLAY de los motivos. Los registros en la tabla
-- `rechazos` mantienen su `ds_rechazo` crudo intacto.
-- =====================================================================

UPDATE catalogo_rechazos
   SET ds_rechazo = 'ERROR DE DISTRIBUCIÓN'
 WHERE id_rechazo = 15
   AND ds_rechazo = 'ERROR DE DISTRIBUCIO';

UPDATE catalogo_rechazos
   SET ds_rechazo = 'DEVOLUCIÓN POR TRÁMITES INTERNOS'
 WHERE id_rechazo = 19
   AND ds_rechazo = 'DEV X TRAMITES INTER';

-- Verificación:
-- SELECT id_rechazo, ds_rechazo FROM catalogo_rechazos ORDER BY ds_rechazo;
