-- =============================================================
-- 064 — rechazos: hectolitros como métrica de volumen primaria
-- =============================================================
-- El dashboard de rechazos pasa a medir el volumen rechazado en HL
-- (unidad-consistente) en vez de bultos (mezcla packs/unidades según
-- la presentación del artículo). Bultos queda como métrica secundaria.
--
-- - hl_rechazados:  Σ unimedtotal de la línea de rechazo (Chess /ventas).
--                   Los combos vienen en 0 HL — por eso bultos sigue vivo.
--
-- El denominador en HL (ventas_diarias.total_hl) ya existe desde el
-- sync original, no requiere columna nueva.
--
-- Idempotente vía IF NOT EXISTS. Aplicar en AMBOS tenants (Pampeana y
-- Misiones): el código de rechazos es compartido y un deploy con la
-- columna ausente en una de las DB rompería esa.

ALTER TABLE rechazos
  ADD COLUMN IF NOT EXISTS hl_rechazados NUMERIC;

COMMENT ON COLUMN rechazos.hl_rechazados IS
  'Hectolitros rechazados (Σ unimedtotal de la línea Chess). Métrica de volumen primaria. Combos = 0 HL.';
