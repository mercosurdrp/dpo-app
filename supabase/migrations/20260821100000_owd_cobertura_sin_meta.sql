-- =============================================
-- OWD de Almacén: cobertura del padrón, no meta mensual.
--
-- La meta_mensual = 8 era un default que nadie tocó. Para Almacén no existe
-- "meta": la expectativa es que de cada tarea se observe a TODOS los operadores
-- que la realizan. El padrón de quién hace qué ya está en skap_asignaciones.
--
-- meta_mensual pasa a ser NULLable: NULL = plantilla por cobertura.
-- roles_cobertura dice qué roles SKAP tiene que cubrir la plantilla.
-- =============================================
BEGIN;

ALTER TABLE owd_templates ALTER COLUMN meta_mensual DROP NOT NULL;
ALTER TABLE owd_templates ALTER COLUMN meta_mensual DROP DEFAULT;

ALTER TABLE owd_templates
  ADD COLUMN IF NOT EXISTS roles_cobertura TEXT[];

COMMENT ON COLUMN owd_templates.meta_mensual IS
  'Objetivo de observaciones por mes. NULL = la plantilla NO se mide por meta, se mide por cobertura del padrón (ver roles_cobertura).';
COMMENT ON COLUMN owd_templates.roles_cobertura IS
  'Roles SKAP que esta OWD tiene que cubrir. Todo empleado activo con alguno de estos roles en skap_asignaciones debe tener observación dentro del ciclo. NULL/vacío = sin control de cobertura.';

-- Guarda: o se mide por meta, o por cobertura, no por las dos.
ALTER TABLE owd_templates DROP CONSTRAINT IF EXISTS owd_templates_meta_xor_cobertura;
ALTER TABLE owd_templates ADD CONSTRAINT owd_templates_meta_xor_cobertura
  CHECK (meta_mensual IS NULL OR roles_cobertura IS NULL OR cardinality(roles_cobertura) = 0);

-- ---------------------------------------------
-- Almacén: sacar la meta, poner el padrón que corresponde.
-- Los roles salen de a quién se viene observando en cada plantilla.
-- ---------------------------------------------
UPDATE owd_templates SET meta_mensual = NULL, roles_cobertura = ARRAY['pickero']
WHERE id = '408cb530-f188-4854-9c76-e6b7bb51e430';   -- 4.1 Proceso de Picking

UPDATE owd_templates SET meta_mensual = NULL, roles_cobertura = ARRAY['autoelevadorista']
WHERE id = 'acdc58ad-4446-4c56-82a4-3456f9c24af9';   -- 4.2 Reposición del Área de Picking

UPDATE owd_templates SET meta_mensual = NULL, roles_cobertura = ARRAY['pickero']
WHERE id = '27549014-6907-4a5d-b431-d06095309c3c';   -- 4.3 Verificación de cargas

UPDATE owd_templates SET meta_mensual = NULL, roles_cobertura = ARRAY['autoelevadorista']
WHERE id = 'b400b7be-5a03-4ddd-8b91-4869a4fdfd52';   -- 5.1 Carga y Descarga

COMMIT;

NOTIFY pgrst, 'reload schema';
