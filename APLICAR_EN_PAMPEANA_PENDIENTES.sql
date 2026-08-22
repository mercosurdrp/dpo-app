-- ============================================================================
-- APLICAR EN: Supabase PAMPEANA — proyecto `dpo` (ref tpafgmbhnucdiavvxbcg)
--   https://supabase.com/dashboard/project/tpafgmbhnucdiavvxbcg/sql/new
--
-- CONSOLIDADO DE PENDIENTES — armado el 21-08-2026.
-- Copiar TODO el archivo y ejecutarlo de una sola vez.
--
-- Verificado contra la base ese mismo día: estos son los DOS bloques que
-- faltaban. Todo lo demás que hay en el repo como APLICAR_EN_PAMPEANA_*.sql ya
-- estaba aplicado y NO se incluye acá.
--
-- Los dos bloques son idempotentes: correr esto dos veces no rompe nada.
-- Cada bloque va en su propia transacción, así que si uno fallara el otro se
-- aplica igual.
--
-- ----------------------------------------------------------------------------
-- BLOQUE 1 — OWD de Almacén por cobertura del padrón
--   Fuente: APLICAR_EN_PAMPEANA_OWD_COBERTURA_SIN_META.sql
--   Por qué: el código ya está en producción (deploy del 21-08-2026) y hoy
--   funciona por un fallback hardcodeado. Sin este SQL, vaciar la meta de una
--   plantilla en el editor tira error (meta_mensual sigue NOT NULL).
--
-- BLOQUE 2 — Tabla reunion_apertura_picking
--   Fuente: APLICAR_EN_SUPABASE.sql (migración 058, de mayo 2026), SOLO su
--   parte b). La tabla nunca se creó: hoy cargar el HL/HH por operador en la
--   apertura de picking de una reunión falla.
--
--   🚨 SE EXCLUYE A PROPÓSITO la parte a) de esa migración (insertaba 6 KPIs
--   'warehouse': WQI, FGLI, SCL, Precisión picking, Capacidad utilizada,
--   Productividad de picking). La config de KPIs de reuniones cambió mucho
--   desde mayo — hoy en la base hay 9 con otros nombres y otro orden — así que
--   correr aquel INSERT agregaría 4 KPIs nuevos a la reunión de almacén sin que
--   nadie los haya pedido. Si SÍ se quieren, se pide aparte.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 — OWD de Almacén: cobertura del padrón, no meta mensual
-- ============================================================================
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

-- ============================================================================
-- BLOQUE 2 — Tabla de apertura de picking por operador (migración 058, parte b)
-- ============================================================================
BEGIN;

-- b) Tabla de apertura por operador (Troli/Galvez/Ovejero por reunion)
CREATE TABLE IF NOT EXISTS reunion_apertura_picking (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id  uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  operador    text NOT NULL,
  bultos      int,
  errores     int,
  hl_hh       numeric(14,2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reunion_id, operador)
);

CREATE INDEX IF NOT EXISTS idx_reunion_apertura_picking_reunion
  ON reunion_apertura_picking(reunion_id);

ALTER TABLE reunion_apertura_picking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reunion_apertura_picking_select_auth" ON reunion_apertura_picking;
CREATE POLICY "reunion_apertura_picking_select_auth"
  ON reunion_apertura_picking FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reunion_apertura_picking_write_auth" ON reunion_apertura_picking;
CREATE POLICY "reunion_apertura_picking_write_auth"
  ON reunion_apertura_picking FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
COMMIT;


-- Que PostgREST vea el esquema nuevo sin esperar al refresco automático.
NOTIFY pgrst, 'reload schema';
