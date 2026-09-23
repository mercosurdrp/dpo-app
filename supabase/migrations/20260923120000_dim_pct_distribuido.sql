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

-- Ocupación de bodega (del camión) por temporada, para dimensionar la flota:
-- camiones necesarios = volumen ÷ (capacidad del camión × ocupación de bodega del mes).
-- Temporada alta (ene, feb, mar, nov, dic) 60 %; baja (el resto) 35 %. Pedido de
-- Sebastián del 23/09/2026; replica la fila "Ocupación de Bodega" del Simulador
-- de Flota de Casa Central (pallets reales por viaje, por mes).
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS ocup_bodega_alta     numeric NOT NULL DEFAULT 0.60;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS ocup_bodega_baja     numeric NOT NULL DEFAULT 0.35;
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS meses_temporada_alta text    NOT NULL DEFAULT '1,2,3,11,12';

commit;
