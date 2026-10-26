-- =============================================================================
-- Bots por pilar (fase 2): bot de Almacén, reunión de bots y aprobación por
-- WhatsApp
-- =============================================================================
--  - bots_corridas.bot_key pasa a ser opcional: la reunión de bots no es de
--    un solo bot (tipo = 'reunion', bot_key NULL).
--  - bots_planes_propuestos.fecha + numero: cada día los planes propuestos se
--    numeran desde 1 para aprobarlos respondiendo «sí 3» por WhatsApp.
--  - Seed del bot de Almacén (reunión 'warehouse'), a Fausto mientras se
--    calibra.
-- =============================================================================

ALTER TABLE bots_corridas ALTER COLUMN bot_key DROP NOT NULL;

ALTER TABLE bots_planes_propuestos ADD COLUMN IF NOT EXISTS fecha DATE;
ALTER TABLE bots_planes_propuestos ADD COLUMN IF NOT EXISTS numero INT;

UPDATE bots_planes_propuestos p
SET fecha = c.fecha
FROM bots_corridas c
WHERE c.id = p.corrida_id AND p.fecha IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bots_planes_fecha_numero
  ON bots_planes_propuestos (fecha, numero)
  WHERE numero IS NOT NULL;

-- ── Seed: bot de Almacén ─────────────────────────────────────────────────────
INSERT INTO bots_pilar (key, nombre, emoji, reunion_tipo, indicadores, encargado_profile_id, telefono, prompt_extra)
SELECT
  'almacen',
  'Almacén',
  '📦',
  'warehouse',
  '{}',
  (SELECT id FROM profiles WHERE email = 'fazzaretti@mercosurdrp.com.ar' LIMIT 1),
  '5493407494491',                              -- Fausto, mientras se calibra
  'Indicadores de la Reunión de Warehouse (depósito). SHO = reportes de seguridad, se mide en el acumulado del mes. Productividad de picking = bultos preparados por hora-hombre. Reabastecimiento durante el picking = % de reposiciones que se hacen en plena preparación (debería hacerse antes). Despacho de camiones = minutos de maquinista por camión al cargar; Descarga de acarreos = minutos por camión al descargar. Errores de picking, Precisión de picking, Roturas y Faltantes (HL) miden calidad del armado y del inventario. Los roles posibles son Supervisor de Almacén, Jefe de Depósito, Encargado de Picking, Maquinista / Autoelevadorista y Analista de Inventario.'
ON CONFLICT (key) DO NOTHING;
