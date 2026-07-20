-- =============================================
-- Plan Territorial  (DPO · Pilar Planeamiento · punto 5.1)
--
-- El 5.1 pide cuatro cosas y cada tabla de acá cubre una:
--
--   R5.1.1  escenario "de ensueño" + escenario objetivo, ambos con su VLC/HL
--           -> territorial_escenarios
--   R5.1.2  plan alineado ventas+operaciones, implementado, con métricas de
--           éxito ligadas a la reducción de VLC/HL
--           -> territorial_planes (doble responsable = la evidencia de alineación)
--   R5.1.3  revisión mensual de ventas y operaciones sobre el progreso
--           -> territorial_revisiones
--   R5.1.4  mostrar la mejora del VLC/HL a partir de las acciones
--           -> linea_base + fecha_implementacion en territorial_planes, contra
--              la serie viva de get_costo_por_pdv (no se duplica el costo acá)
--
-- Nada de esto guarda costos: el $/HL por ciudad se lee siempre en vivo de la
-- RPC get_costo_por_pdv_json. Lo único que se congela es la LÍNEA BASE de cada
-- plan, justamente para poder comparar contra ella.
-- =============================================


-- ---------------------------------------------
-- 1) Escenarios de planificación territorial
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS territorial_escenarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio        integer NOT NULL,
  tipo        text    NOT NULL CHECK (tipo IN ('base','objetivo','dream')),
  nombre      text    NOT NULL,
  vlc_hl      numeric,
  supuestos   text,
  -- Matriz ciudad -> km desde el CD del escenario. Sólo la usa 'dream': es lo
  -- que se le pasa a get_costo_por_pdv_sim para recalcular el costo como si el
  -- centro de distribución estuviera en otro lado.
  km_ciudad   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id),
  UNIQUE (anio, tipo)
);

COMMENT ON TABLE territorial_escenarios IS
  'DPO 5.1 — escenarios de planificación territorial. base = VLC/HL actual, '
  'objetivo = meta del año con las acciones ejecutadas, dream = escenario '
  'aspiracional (relocalización del CD).';
COMMENT ON COLUMN territorial_escenarios.km_ciudad IS
  'ciudad -> km de ruta desde el CD simulado. Se le pasa tal cual a '
  'get_costo_por_pdv_sim(p_km).';


-- ---------------------------------------------
-- 2) Planes de acción territoriales
--
-- Doble responsable a propósito: R5.1.2 exige que el plan esté alineado con
-- ventas Y operaciones. Un plan con un solo responsable no alcanza como
-- evidencia, así que el modelo lo hace explícito en vez de dejarlo librado a
-- que alguien lo aclare en la descripción.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS territorial_planes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciudad        text NOT NULL,
  titulo        text NOT NULL,
  descripcion   text,
  palanca       text NOT NULL DEFAULT 'otro'
                CHECK (palanca IN ('frecuencia','drop_size','cartera','relocalizacion','otro')),

  -- Métrica de éxito (R5.1.2). El valor vivo sale de la RPC de costo por PDV;
  -- acá sólo se congela contra qué se compara.
  linea_base        numeric,
  linea_base_desde  date,
  linea_base_hasta  date,
  meta              numeric,

  -- Sin esta fecha no se puede atribuir la mejora (R5.1.4): es la línea
  -- vertical que parte la serie en "antes" y "después".
  fecha_implementacion date,

  responsable_comercial_id  uuid REFERENCES profiles(id),
  responsable_logistica_id  uuid REFERENCES profiles(id),

  prioridad     text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_progreso','completado')),
  fecha_objetivo date,

  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS territorial_planes_ciudad_idx ON territorial_planes(ciudad);

COMMENT ON COLUMN territorial_planes.linea_base IS
  '$/HL de la ciudad en el período base, congelado al crear el plan. La mejora '
  'se mide contra este número, no contra el mes anterior.';
COMMENT ON COLUMN territorial_planes.fecha_implementacion IS
  'Cuándo se empezó a ejecutar. Parte la serie en antes/después (R5.1.4).';


-- ---------------------------------------------
-- 3) Avances / seguimiento
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS territorial_planes_avances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           uuid NOT NULL REFERENCES territorial_planes(id) ON DELETE CASCADE,
  comentario        text,
  estado_resultante text CHECK (estado_resultante IN ('pendiente','en_progreso','completado')),
  -- $/HL de la ciudad al momento del avance: deja la foto de cómo venía la
  -- métrica cuando se escribió el comentario.
  costo_x_hl        numeric,
  autor_id          uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS territorial_planes_avances_plan_idx
  ON territorial_planes_avances(plan_id);


-- ---------------------------------------------
-- 4) Revisiones mensuales (R5.1.3)
--
-- Una por mes. Es la evidencia de que ventas y operaciones efectivamente
-- revisaron el progreso, que es lo que el auditor pide ver.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS territorial_revisiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio          integer NOT NULL,
  mes           integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  participantes text,
  conclusion    text,
  vlc_hl_mes    numeric,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);


-- ---------------------------------------------
-- 5) RLS
--
-- Lectura para cualquier usuario autenticado; escritura para roles de gestión.
-- auth.uid() va envuelto en (select ...) para que el planner lo evalúe una vez
-- por query y no una vez por fila (initplan).
-- ---------------------------------------------
ALTER TABLE territorial_escenarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE territorial_planes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE territorial_planes_avances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE territorial_revisiones      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'territorial_escenarios',
    'territorial_planes',
    'territorial_planes_avances',
    'territorial_revisiones'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM profiles p
                       WHERE p.id = (select auth.uid())
                         AND p.role::text = ANY (ARRAY['admin','supervisor','admin_rrhh'])))
        WITH CHECK (EXISTS (SELECT 1 FROM profiles p
                            WHERE p.id = (select auth.uid())
                              AND p.role::text = ANY (ARRAY['admin','supervisor','admin_rrhh'])))
    $f$, t || '_write', t);
  END LOOP;
END $$;


-- ---------------------------------------------
-- 6) Semilla: los tres escenarios 2026
--
-- Los km del escenario de ensueño son ESTIMADOS (ruta desde San Nicolás) y
-- quedan editables: hay que validarlos contra distancias reales antes de
-- presentar el número en auditoría.
-- ---------------------------------------------
INSERT INTO territorial_escenarios (anio, tipo, nombre, supuestos, km_ciudad)
VALUES
  (2026, 'base', 'VLC/HL actual — CD Ramallo',
   'Costo logístico real (almacén + distancia + distribución) sobre HL vendidos. '
   'Se lee en vivo de get_costo_por_pdv; no se carga a mano.',
   NULL),

  (2026, 'objetivo', 'Objetivo 2026 — frecuencia Colón + drop size Arrecifes',
   'Meta de reducción de VLC/HL con las dos acciones de corto plazo ejecutadas. '
   'El valor se completa con el delta comprometido de cada plan.',
   NULL),

  (2026, 'dream', 'Escenario de ensueño — CD en San Nicolás',
   'Relocalización del centro de distribución a San Nicolás, donde está el 44% '
   'de los PDV y el 46% del volumen. Recalcula el costo con la matriz de km '
   'desde San Nicolás, sin cambiar nada más. '
   'ATENCIÓN: los km son estimados de ruta y hay que validarlos.',
   '{"San Nicolás": 8, "Ramallo": 24, "Pergamino": 55, "Arrecifes": 95, "Colón": 110}'::jsonb)
ON CONFLICT (anio, tipo) DO NOTHING;
