-- =============================================================
-- INDICADOR "FUERAS DE RUTA" — MIGRACIÓN V2: usar diasEntrega
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
--
-- Cambio: el indicador ahora compara contra Chess `diasEntrega`
-- (a nivel cliente/eClifuerza) en lugar de `diasVisita` (a nivel ruta).
-- `diasVisita` solo refleja la visita del promotor de preventa.
-- =============================================================

-- 1) clientes: nueva columna dias_entrega_iso (ISO 1=Lun..7=Dom)
ALTER TABLE chess_clientes_ruta_misiones
  ADD COLUMN IF NOT EXISTS dias_entrega_iso SMALLINT[] NOT NULL DEFAULT '{}';

-- 2) rutas: drop columna inútil (diasVisita no debe usarse para este indicador)
ALTER TABLE chess_rutas_misiones
  DROP COLUMN IF EXISTS dias_visita_iso;

-- 3) Vista: comparar contra c.dias_entrega_iso (no más r.dias_visita_iso).
CREATE OR REPLACE VIEW v_fueras_de_ruta_misiones AS
SELECT
  p.id_cliente,
  p.fecha_entrega,
  p.eliminado,
  p.items_total,
  p.items_no_anulados,
  p.unidades_total,
  p.monto_aprox,
  p.synced_at,
  p.sync_run_id,
  c.razon_social,
  c.des_canal_mkt,
  c.des_localidad,
  c.calle_entrega,
  c.altura_entrega,
  c.id_ruta,
  c.dias_entrega_iso,
  r.des_ruta,
  r.id_personal,
  r.des_personal,
  EXTRACT(ISODOW FROM p.fecha_entrega)::INT AS dow_iso_entrega,
  CASE
    WHEN c.id_ruta IS NULL THEN NULL
    WHEN c.dias_entrega_iso IS NULL OR cardinality(c.dias_entrega_iso) = 0 THEN NULL
    WHEN EXTRACT(ISODOW FROM p.fecha_entrega)::INT = ANY(c.dias_entrega_iso) THEN false
    ELSE true
  END AS es_fuera_de_ruta
FROM chess_pedidos_misiones p
LEFT JOIN chess_clientes_ruta_misiones c ON c.id_cliente = p.id_cliente
LEFT JOIN chess_rutas_misiones r ON r.id_ruta = c.id_ruta;
