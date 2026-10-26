-- =============================================================================
-- Bots por pilar: action log del encargado en la ronda
-- =============================================================================
-- La ronda suma, después de «Seguridad primero», los planes vencidos del
-- encargado (los mismos de /planes). Solo donde el encargado cargado es quien
-- recibe el mensaje: en Seguridad y Planeamiento el encargado es provisorio
-- y mandaría los pendientes de otra persona.
-- =============================================================================

ALTER TABLE bots_pilar ADD COLUMN IF NOT EXISTS action_log BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE bots_pilar SET action_log = TRUE WHERE key IN ('entrega', 'almacen', 'flota');
