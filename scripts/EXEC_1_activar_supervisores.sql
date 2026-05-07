-- =============================================
-- EXEC #1 — Activar puede_asignar_tareas para supervisores
-- =============================================
-- Aplicar DESPUÉS de la migración 049.
--
-- Editá la lista de emails abajo con los reales (los identificás en
-- /admin/usuarios o con el SELECT de chequeo).
-- =============================================

-- Chequeo previo: ¿quiénes matchean?
-- (corré primero solo el SELECT para ver qué encuentra)
SELECT id, nombre, email, role, active, puede_asignar_tareas
FROM profiles
WHERE email IN (
  'ealtube@mercosur.local',           -- Esteban Altube (revisar)
  'fazzaretti@mercosurdrp.com.ar',    -- Fausto Azzaretti
  'sroselli@mercosurdrp.com.ar',      -- Sebastián Roselli (revisar)
  'msala@mercosurdrp.com.ar',         -- Sala Marcos (revisar)
  'gveidoski@mercosurdrp.com.ar'      -- German Veidoski (revisar)
)
ORDER BY nombre;

-- Si todos los emails matchearon a la persona correcta, ejecutá:
UPDATE profiles
SET puede_asignar_tareas = TRUE
WHERE email IN (
  'ealtube@mercosur.local',
  'fazzaretti@mercosurdrp.com.ar',
  'sroselli@mercosurdrp.com.ar',
  'msala@mercosurdrp.com.ar',
  'gveidoski@mercosurdrp.com.ar'
);

-- Verificación post-ejecución
SELECT nombre, email, puede_asignar_tareas
FROM profiles
WHERE puede_asignar_tareas = TRUE
ORDER BY nombre;
