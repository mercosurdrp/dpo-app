-- =============================================
-- OWD: restricción opcional de observados por plantilla
-- Permite acotar el dropdown "empleado observado" y fijar un supervisor
-- por defecto en plantillas puntuales (ej. OWD 3.3 enrutamiento), sin
-- afectar a las demás OWD (que siguen con el universo global de empleados).
-- =============================================

ALTER TABLE owd_templates
  ADD COLUMN IF NOT EXISTS empleados_permitidos TEXT[],   -- NULL = usar empleados activos globales
  ADD COLUMN IF NOT EXISTS supervisor_default TEXT;       -- NULL = supervisor en blanco

UPDATE owd_templates
SET empleados_permitidos = ARRAY['Ezequiel Teves','Fausto Azzaretti','Pedro Martinez'],
    supervisor_default = 'Fausto Azzaretti'
WHERE id = '92b87b33-b272-4315-9e0d-07dd1a77ebff';
