-- =============================================
-- EXEC #3 — Cargar participantes fijos de Warehouse
-- =============================================
-- Inserta a Esteban + cada operador de depósito como participante fijo
-- de la reunión Warehouse. Idempotente: ON CONFLICT DO NOTHING.
--
-- Editá la lista de emails con los reales de los operadores. Esteban ya
-- está incluido.
-- =============================================

-- Chequeo previo: ¿qué profiles matchean los emails?
SELECT id, nombre, email, active
FROM profiles
WHERE email IN (
  'ealtube@mercosur.local',           -- Esteban Altube
  -- Agregá un email por línea (uno por operador)
  'operador1@dpo.local',
  'operador2@dpo.local',
  'operador3@dpo.local'
)
ORDER BY nombre;

-- Si los matches están OK, insertá los participantes fijos:
INSERT INTO reuniones_participantes_fijos (tipo, profile_id)
SELECT 'warehouse', p.id
FROM profiles p
WHERE p.email IN (
  'ealtube@mercosur.local',
  'operador1@dpo.local',
  'operador2@dpo.local',
  'operador3@dpo.local'
)
ON CONFLICT (tipo, profile_id) DO NOTHING;

-- Verificación: los que quedaron como fijos
SELECT pf.tipo, p.nombre, p.email
FROM reuniones_participantes_fijos pf
JOIN profiles p ON p.id = pf.profile_id
WHERE pf.tipo = 'warehouse'
ORDER BY p.nombre;
