-- Dimensionamiento (DPO Planeamiento 2.3) — SOLO Pampeana
-- pct_distribuido: fracción del presupuesto de venta (HL facturados) que realmente
-- se pickea y sale a reparto con flota propia. El presupuesto es venta facturada;
-- el depósito y la flota mueven ~80 % de eso (agosto 2026: 6.894 distribuidos
-- sobre 9.083 vendidos = 0,76). Pedido de Sebastián del 23/09/2026: una fila
-- "Presupuesto a distribuir" = presupuesto × pct, y que la proyección se
-- dimensione sobre ESE volumen (anclaje del volumen base al presupuesto a
-- distribuir del mes en curso).
begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS pct_distribuido numeric NOT NULL DEFAULT 0.80;

commit;
