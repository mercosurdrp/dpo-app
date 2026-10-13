-- =============================================
-- Plan Territorial = reestructuración de rutas (DPO 5.1) — 13/10/2026
--
-- Sebastián redefinió el alcance del módulo: el plan territorial es la
-- reestructuración de rutas de PROMOTORES (visita) y de ENTREGA de una ciudad,
-- las dos juntas, porque el día de visita define el día de pedido y ése el de
-- reparto. Lo que no es eso sale del módulo:
--   · la mudanza del CD a San Nicolás (era el escenario "de ensueño"),
--   · el drop size de Arrecifes (ya se había retirado el 11/09/2026).
--
-- Tres cambios:
--
-- 1) Un plan puede tener VARIAS reestructuraciones ("etapas"). Colón tuvo dos:
--    agosto (3 días de entrega) y la REV.06 de octubre (los pueblos juntos el
--    miércoles). Antes territorial_rediseno_rutas tenía UNA fila por plan
--    (PK = plan_id); ahora tiene una fila por etapa, con su propia fecha de
--    implementación, título y archivo de evidencia (la presentación del 5.1).
--
-- 2) La "palanca" del plan pasa a ser el ALCANCE del cambio de rutas:
--    entrega / visita / ambas. Las palancas viejas (frecuencia, drop size,
--    cartera, relocalización) ya no describen nada de este módulo.
--
-- 3) Los escenarios 2026 se renombran: objetivo = Colón + Ramallo
--    reestructuradas; ensueño = toda la red con rutas reestructuradas. El
--    VLC/HL de ambos lo deriva la app de los planes (ver objetivoDerivado y
--    ensuenoDerivado en plan-territorial-client.tsx); la matriz de km desde
--    San Nicolás queda en NULL porque ya no hay simulación de CD acá.
-- =============================================


-- ---------------------------------------------
-- 1) Etapas de rediseño por plan
-- ---------------------------------------------
ALTER TABLE territorial_rediseno_rutas
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS etapa integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS fecha_implementacion date,
  ADD COLUMN IF NOT EXISTS evidencia_archivo_id uuid REFERENCES dpo_archivos(id) ON DELETE SET NULL;

-- La PK pasa de plan_id a id. El nombre de la constraint vieja es el que genera
-- Postgres para una PK sin nombre: <tabla>_pkey.
ALTER TABLE territorial_rediseno_rutas DROP CONSTRAINT IF EXISTS territorial_rediseno_rutas_pkey;
ALTER TABLE territorial_rediseno_rutas ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS territorial_rediseno_rutas_plan_etapa_idx
  ON territorial_rediseno_rutas(plan_id, etapa);

COMMENT ON TABLE territorial_rediseno_rutas IS
  'DPO 5.1 — una fila por ETAPA de reestructuración de rutas de un plan '
  'territorial: antes/después del rutero de promotores y de las rutas de '
  'reparto, con su fecha de implementación y la presentación que lo respalda.';
COMMENT ON COLUMN territorial_rediseno_rutas.etapa IS
  'Orden dentro del plan (1, 2, …). Colón: 1 = 3 días de entrega (ago 2026), '
  '2 = REV.06 pueblos el miércoles (oct 2026).';
COMMENT ON COLUMN territorial_rediseno_rutas.fecha_implementacion IS
  'Desde cuándo rige esta etapa. Parte la serie de $/HL de la ciudad en '
  'antes/después (R5.1.4). NULL = propuesta todavía no implementada.';
COMMENT ON COLUMN territorial_rediseno_rutas.evidencia_archivo_id IS
  'Archivo de dpo_archivos (Planeamiento 5.1) con el análisis: la presentación '
  'de rutas hoy vs propuesta.';


-- ---------------------------------------------
-- 2) Palanca → alcance del cambio de rutas
-- ---------------------------------------------
ALTER TABLE territorial_planes DROP CONSTRAINT IF EXISTS territorial_planes_palanca_check;
UPDATE territorial_planes
   SET palanca = CASE
     WHEN palanca = 'frecuencia' THEN 'ambas'
     WHEN palanca IN ('entrega', 'visita', 'ambas') THEN palanca
     ELSE 'ambas'
   END;
ALTER TABLE territorial_planes ALTER COLUMN palanca SET DEFAULT 'ambas';
ALTER TABLE territorial_planes
  ADD CONSTRAINT territorial_planes_palanca_check
  CHECK (palanca IN ('entrega', 'visita', 'ambas'));

COMMENT ON COLUMN territorial_planes.palanca IS
  'Alcance de la reestructuración de rutas: entrega (sólo días/zonas de '
  'reparto), visita (sólo rutero de promotores) o ambas.';


-- ---------------------------------------------
-- 3) Escenarios 2026
-- ---------------------------------------------
UPDATE territorial_escenarios
   SET nombre = 'Objetivo 2026 — rutas de Colón y Ramallo reestructuradas',
       supuestos = 'VLC/HL de la red si cada ciudad con plan de rutas llega a su meta '
                   '(Colón desde el 10/08/2026, Ramallo y Villa Ramallo desde el '
                   '05/10/2026). Lo calcula la app a partir de las metas de los planes, '
                   'ponderadas por volumen; no se carga a mano.',
       vlc_hl = NULL,
       km_ciudad = NULL,
       updated_at = now()
 WHERE anio = 2026 AND tipo = 'objetivo';

UPDATE territorial_escenarios
   SET nombre = 'Escenario de ensueño — toda la red con rutas reestructuradas',
       supuestos = 'Qué pasaría si San Nicolás, Pergamino y Arrecifes también '
                   'reestructuraran sus rutas de visita y entrega con la misma '
                   'reducción porcentual de $/HL que se fijó como meta en Colón y '
                   'Ramallo. Es una extrapolación, no un plan: sirve para dimensionar '
                   'cuánto queda por capturar. Lo calcula la app; se puede fijar un '
                   'número a mano si se hace un análisis específico.',
       vlc_hl = NULL,
       km_ciudad = NULL,
       updated_at = now()
 WHERE anio = 2026 AND tipo = 'dream';
