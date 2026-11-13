-- Plan Territorial: base CONGELADA de distribución contra la red (13/11/2026).
--
-- El cumplimiento de cada plan se mide con el índice de distribución:
-- $/HL de distribución de la ciudad ÷ $/HL de distribución de la red (las
-- ciudades juntas). La base es ese índice en los meses de la línea base y queda
-- guardada acá para que no cambie si se corrige un mes viejo.
-- Valores calculados el 13/11/2026 (con los km de octubre ya corregidos).

ALTER TABLE territorial_planes
  ADD COLUMN IF NOT EXISTS base_dist_x_hl numeric,
  ADD COLUMN IF NOT EXISTS base_red_dist_x_hl numeric;

COMMENT ON COLUMN territorial_planes.base_dist_x_hl IS
  '$/HL de distribución de la ciudad en los meses de la línea base (congelado).';
COMMENT ON COLUMN territorial_planes.base_red_dist_x_hl IS
  '$/HL de distribución de la red (ciudades) en los meses de la línea base (congelado). Índice base = base_dist_x_hl / base_red_dist_x_hl.';

-- Colón (ene–jul 2026): índice 2,30
UPDATE territorial_planes SET base_dist_x_hl = 33591.45, base_red_dist_x_hl = 14619.31
WHERE id = '4385574a-7ee9-4b89-ab6f-20d0f95e3f9f';
-- Ramallo (ene–ago 2026): índice 0,33
UPDATE territorial_planes SET base_dist_x_hl = 4921.08, base_red_dist_x_hl = 14788.96
WHERE id = 'b2e4c6d8-1a3f-4b5c-9d7e-2f4a6c8e0b1d';

SELECT ciudad, base_dist_x_hl, base_red_dist_x_hl,
       round(base_dist_x_hl / base_red_dist_x_hl, 3) AS indice_base
FROM territorial_planes ORDER BY ciudad;
