-- Target de productividad de maquinistas (Pal/HH que vale 100 puntos) para
-- el ranking de ayudantes de depósito. Solo aplica en Pampeana (Misiones no
-- tiene s5_ayudantes_config).
ALTER TABLE s5_ayudantes_config
  ADD COLUMN IF NOT EXISTS prod_target_maq NUMERIC NOT NULL DEFAULT 18;
