-- =============================================
-- 134 · Planeamiento 2.4 · Mantenimiento de Instalaciones (Facility Maintenance)
-- =============================================
-- Port nativo de la app "Plan de Mantenimiento Edilicio" (FastAPI) a dpo-app.
-- Cubre el punto DPO Planeamiento 2.4 / Gestión de Riesgos:
--   R2.4.1 checklist con ítems críticos  · mant_preguntas / mant_revisiones / mant_puntajes
--   R2.4.2 revisión trimestral + planes  · mant_pdas / mant_evidencias
--   R2.4.3 RACI de ejecución             · mant_raci
--   R2.4.4 base de proveedores           · mant_proveedores (+ evaluación)
--
-- Idempotente. SOLO Misiones (las pantallas se gatean con IS_MISIONES).
-- =============================================

BEGIN;

-- 1) Banco de preguntas del checklist (36 ítems, 9 secciones)
CREATE TABLE IF NOT EXISTS mant_preguntas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          TEXT NOT NULL UNIQUE,
  seccion_num     INTEGER NOT NULL,
  seccion_titulo  TEXT NOT NULL,
  bloque          TEXT NOT NULL,
  pregunta        TEXT NOT NULL,
  verificacion    TEXT,
  explicacion     TEXT,
  aplicabilidad   TEXT,
  peso_item       NUMERIC NOT NULL DEFAULT 1,
  es_critico      BOOLEAN NOT NULL DEFAULT false,
  orden           INTEGER NOT NULL DEFAULT 0
);

-- 2) Revisiones (recorridas trimestrales)
CREATE TABLE IF NOT EXISTS mant_revisiones (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo     TEXT NOT NULL,
  fecha       DATE NOT NULL,
  cerrada     BOOLEAN NOT NULL DEFAULT false,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Puntajes por (revisión, pregunta)
CREATE TABLE IF NOT EXISTS mant_puntajes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision_id   BIGINT NOT NULL REFERENCES mant_revisiones(id) ON DELETE CASCADE,
  pregunta_id   BIGINT NOT NULL REFERENCES mant_preguntas(id) ON DELETE CASCADE,
  puntaje       TEXT,
  comentario    TEXT,
  UNIQUE (revision_id, pregunta_id)
);

-- 4) Proveedores (base de datos)
CREATE TABLE IF NOT EXISTS mant_proveedores (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre         TEXT NOT NULL,
  tipo_servicio  TEXT,
  alcance        TEXT,
  direccion      TEXT,
  telefono       TEXT,
  email          TEXT,
  contacto       TEXT,
  notas          TEXT
);

-- 5) Planes de acción (PDA)
CREATE TABLE IF NOT EXISTS mant_pdas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pregunta_id     BIGINT NOT NULL REFERENCES mant_preguntas(id) ON DELETE CASCADE,
  revision_id     BIGINT REFERENCES mant_revisiones(id) ON DELETE SET NULL,
  proveedor_id    BIGINT REFERENCES mant_proveedores(id) ON DELETE SET NULL,
  titulo          TEXT NOT NULL,
  descripcion     TEXT,
  tipo            TEXT NOT NULL DEFAULT 'reparacion',
  responsable     TEXT,
  fecha_probable  DATE,
  avance_pct      INTEGER NOT NULL DEFAULT 0,
  estado          TEXT NOT NULL DEFAULT 'planificado',
  costo_estimado  NUMERIC,
  costo_ejecutado NUMERIC,
  fecha_ejecucion DATE,
  rubro           TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mant_pdas_pregunta ON mant_pdas(pregunta_id);
CREATE INDEX IF NOT EXISTS idx_mant_pdas_estado ON mant_pdas(estado);

-- 6) Evidencias de un PDA (archivos en Storage)
CREATE TABLE IF NOT EXISTS mant_evidencias (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pda_id           BIGINT NOT NULL REFERENCES mant_pdas(id) ON DELETE CASCADE,
  storage_path     TEXT NOT NULL,
  nombre_original  TEXT NOT NULL,
  descripcion      TEXT,
  subida_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mant_evidencias_pda ON mant_evidencias(pda_id);

-- 7) Criterios editables para evaluar proveedores
CREATE TABLE IF NOT EXISTS mant_eval_criterios (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  texto        TEXT NOT NULL,
  descripcion  TEXT,
  orden        INTEGER NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT true
);

-- 8) Evaluaciones de proveedor
CREATE TABLE IF NOT EXISTS mant_eval_evaluaciones (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor_id   BIGINT NOT NULL REFERENCES mant_proveedores(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL,
  evaluador      TEXT,
  observaciones  TEXT,
  creada_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9) Puntajes por criterio de una evaluación
CREATE TABLE IF NOT EXISTS mant_eval_puntajes (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluacion_id  BIGINT NOT NULL REFERENCES mant_eval_evaluaciones(id) ON DELETE CASCADE,
  criterio_id    BIGINT NOT NULL REFERENCES mant_eval_criterios(id) ON DELETE CASCADE,
  puntaje        SMALLINT,
  comentario     TEXT
);

-- 10) Matriz RACI de mantenimiento
CREATE TABLE IF NOT EXISTS mant_raci (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actividad               TEXT NOT NULL,
  grupo                   TEXT NOT NULL DEFAULT 'mantenimiento',
  contratista             TEXT,
  coord_hsma              TEXT,
  analista_hsma           TEXT,
  analista_mantenimiento  TEXT,
  jefe_cd                 TEXT,
  orden                   INTEGER NOT NULL DEFAULT 0
);

-- =============================================
-- RLS: lectura/escritura para usuarios autenticados (las pantallas ya
-- gatean por login + IS_MISIONES). Escritura de service_role para jobs.
-- =============================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mant_preguntas','mant_revisiones','mant_puntajes','mant_proveedores',
    'mant_pdas','mant_evidencias','mant_eval_criterios','mant_eval_evaluaciones',
    'mant_eval_puntajes','mant_raci'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_sel', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t||'_all', t);
    EXECUTE format('GRANT ALL ON %I TO anon, authenticated, service_role', t);
  END LOOP;
END$$;

-- =============================================
-- Storage: bucket privado para evidencias
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('mantenimiento-instalaciones', 'mantenimiento-instalaciones', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mant_inst_storage_rw" ON storage.objects;
CREATE POLICY "mant_inst_storage_rw"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'mantenimiento-instalaciones')
  WITH CHECK (bucket_id = 'mantenimiento-instalaciones');

-- =============================================
-- SEED · 36 preguntas del checklist (9 secciones, 7 críticos 1.1–1.7)
-- =============================================
INSERT INTO mant_preguntas
  (codigo, seccion_num, seccion_titulo, bloque, pregunta, verificacion, explicacion, aplicabilidad, peso_item, es_critico, orden)
VALUES
  ('1.1', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', '¿Las estructuras del techo existentes están en buenas condiciones?', 'A-Estructura sin anomalías (óxido, colisión, daños en general) que pongan en riesgo la seguridad y operatividad del Almacén.
B- Aprobación de Ingeniería del proyecto de Techo.
C-Consultar el calendario de mantenimiento cada 6 meses.', '3- No se encontraron anomalías, cronograma de mantenimiento al día y aprobación de ingeniería del proyecto.
1 - Se encontraron algunas anomalías, pero todas mapeadas con un plan de acción y/o aprobación de ingeniería para el proyecto.
0 - Con alguna anomalía sin mapeo y diseño sin aprobación de Ingeniería.', '6) All Management', 1.0, true, 1),
  ('1.2', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', '¿Están en buen estado las tejas (chapas) y canaletas de los techos existentes?', 'A-Compruebe que las tejas (chapas) y canaletas estén libres de daños, goteras y goteos
B-Existe un caudal adecuado para el agua que sale del techo.
C-Consultar el calendario de mantenimiento cada 6 meses.', '3 - No se encontraron anomalías.
1 - Algunas anomalías encontradas, pero todas mapeadas con un plan de acción generando visibilidad con seguimiento.
0 - Plan de acción inconsistente y/o anomalías no mapeadas', '6) All Management', 1.0, true, 2),
  ('1.3', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', '¿Están en perfecto funcionamiento los elementos críticos de seguridad de la propiedad, como: puerta de acceso, puerta de banco (sitio de recaudacion) y camaras de seguridad?', 'Verificar la funcionalidad de los elementos en el sitio y entrevistar a los usuarios (control, conserjería y financieros) de uso común.
Camaras de seguridad con 60 días de imágenes y contrato de mantenimiento de seguridad (control de acceso y camara de seguridad).
Para que todos los artículos estén en perfecto estado es necesario un plan de mantenimiento.', '3- todos los elementos funcionan perfectamente con empleados con buena percepción
1 - al menos 2 elementos funcionan perfectamente y los problemas de los demás han sido mapeados.
0: menos de 2 elementos en perfecta funcionalidad o problemas no mapeados.', '6) All Management', 1.0, true, 3),
  ('1.4', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', '¿Están en perfecto funcionamiento los elementos críticos de calidad como: Cámara de frio, Generador, Pistola de calor, Bloqueo de pallets, Racks y Aire acondicionado (Refrigeracion de producto) ?', 'Verifique la funcionalidad de los elementos en el sitio y entreviste a los usuarios comunes.
Comprobar que todos los elementos estén inventariados en perfecto estado y que exista un plan de corrección para los que no lo estén.
Para que todos los artículos estén en perfecto estado es necesario un plan de acción de mantenimiento.', '3- todos los elementos funcionan perfectamente con empleados con buena percepción
1 - al menos 2 elementos funcionan perfectamente y los problemas de los demás han sido mapeados.
0: menos de 2 elementos en perfecta funcionalidad o problemas no mapeados.', '6) All Management', 1.0, true, 4),
  ('1.5', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', '¿Están en perfecto funcionamiento los elementos de seguridad críticos como: bloqueos de ruedas, líneas de vida, zorras manuales/electricas, autoelevador y carros de distribucion?', 'Verifique la funcionalidad de los elementos en el sitio y entreviste a los usuarios comunes.
Comprobar que todos los elementos estén inventariados en perfecto estado y que exista un plan de corrección para los que no lo estén.
Para que todos los artículos estén en perfecto estado es necesario un plan de acción de mantenimiento.', '3- todos los elementos funcionan perfectamente con empleados con buena percepción
1 - al menos 2 elementos funcionan perfectamente y los problemas de los demás han sido mapeados.
0: menos de 2 elementos en perfecta funcionalidad o problemas no mapeados.', '6) All Management', 1.0, true, 5),
  ('1.6', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', '¿La unidad cuenta con un plan de contingencia para casos críticos?', 'A. Presentar contratos de suministro de agua, suministro de generadores, cortes de energía eléctrica, etc.', '3-Cuenta con un plan de contingencia y cubre el 100% de los ítems críticos.
1 - Cuenta con un plan de contingencia para el 70% de los rubros.
0 - Menos del 70%.', '6) All Management', 3.0, true, 6),
  ('1.7', 1, 'GESTIÓN DE ÁREAS Y EQUIPAMIENTOS CRÍTICOS', 'FUNDAMENTOS', 'La unidad ejecuta una rutina establecida (recorridas y reuniones), creando un plan de acción correcto y consistente?', 'Verificar si la tabla de gestión en la Matinal/Diaria del Distribuidor está actualizada con el indicador del área.

Verificiar que la reunión de Estructura (Mantenimiento) se lleve a cabo con la frecuencia correcta y de acuerdo con los TOR.

Verificar si la Reunión del Pilar se lleva a cabo conforme a la TOR de la reunión DPO

Verificar si la Super Matinal/Vespertina/Noturna aborda el asunto de acuerdo con los TOR

Verificar si el asunto es tratado en la Mensual del Distribuidor o de la región.

Analisar los planes de acción para las anomalías y servicio ya realizados y a ser ejecutados o planificados.', '3 - Reuniones y recorridas son realizadas regularme conforme el SOP y hay un plano de acción para la devolución de la estructura.

1 - Reuniones y recorridas son realizadas parcialmente (por lo menos 75%, con la frecuencia especificada) –  analizar los últimos 3 meses.

0 - Reuniones y recorridas no son realizadas regularmente, de acuerdo con las orientaciones, o están con frecuencia abajo de 75%  –  analizar los últimos 3 meses.

NOTA: Se la reunión de Estructura (Matenimiento) no estuviese siendo realizada en la frecuencia correcta, la pregunta 1.7 deberá ser 0.', '6) All Management', 3.0, true, 7),
  ('2.1', 2, 'GESTION DE PLANO DE TRAFICO', 'FUNDAMENTOS', '¿Las rejas y barandas protectoras están en buenas condiciones y de acuerdo con las especificaciones estándar?', 'A- Durante la visita a la unidad verificar las condiciones de las segregaciones, barandales y portones ¿Están en buen estado?
B- ¿Están en buen estado y garantizan su finalidad?', '3 - Segregaciones, barandas y portones en buenas condiciones de uso.
1 - Conservación con algunos desperfectos en pintura o mantenimiento menor, pero con Producto terminado para ajuste.
0 - Conservación en mal estado sin producto terminado.', '6) All Management', 3.0, false, 8),
  ('2.2', 2, 'GESTION DE PLANO DE TRAFICO', 'FUNDAMENTOS', '¿Están en buen estado las zonas de segregación de picking, espera de conductores, scrap, area de verificacion, retorno de ruta, glp y almacenamiento de gasolina?', 'A- Verificar las condiciones de las áreas a verificar, deben estar en perfectas condiciones para su uso. Si hay alguna anomalía, se debe dejar un registro de lo ocurrido con un plan de acción para su tratamiento.
B- El período entre el registro de la anomalía y el tratamiento debe cumplir con la norma.', '3- Las áreas se encuentran en buen estado. Problemas que se abordan mediante un plan de acción.
1 - Conservación con algunos desperfectos en pintura o mantenimiento menor, pero en tratamiento vía megafonía.
0 - Conservación en mal estado.', '6) All Management', 3.0, false, 9),
  ('2.3', 2, 'GESTION DE PLANO DE TRAFICO', 'FUNDAMENTOS', '¿Están en buen estado la pintura de las sendas peatonales, separación de estibas, espacios para vehículos (ligeros y pesados), guía para la verificacion, senda roja (cruces peligrosos) y señales de equipos contra incendios?', 'A- La Unidad deberá contar con un cronograma de pintura nueva y mantenimiento de las antiguas. Plan de acción para afrontar problemas cuando sea necesario.
B- Durante la visita a la unidad comprobar el estado de conservación de la pintura. Deben seguir el estándar.
C- Letreros en buen estado.', '3 - Pinturas y letreros presentes en todos los lugares definidos y en buen estado.
1 - Pinturas y letreros presentes en todos los lugares definidos, sin embargo existen fallas en la conservación que se abordan con un plan de acción.
0 - Falta de pintura y/o señalización en lugares definidos y/o mal mantenimiento en los existentes.', '6) All Management', 1.0, false, 10),
  ('3.1', 3, 'CONSERVACION CIVIL', 'FUNDAMENTOS', '¿Las áreas de almacenamiento, circulación de vehículos, peatones y áreas administrativas están libres de huecos u otras interferencias?', 'Revisar pisos, rampas y áreas de circulación de la unidad en sitio, analizar FGLI/SCL en busca de roturas y revisar incidentes con agujeros.
Verifique condiciones de crédito inseguras sin tratamiento', '3 - No se encontraron anomalías.
1 - Algunas anomalías encontradas, pero todas mapeadas con un plan de acción generando visibilidad con seguimiento.
0 - Plan de acción inconsistente y/o anomalías no mapeadas', '6) All Management', 1.0, false, 11),
  ('3.2', 3, 'CONSERVACION CIVIL', 'FUNDAMENTOS', '¿Los techos y revestimientos están libres de grietas, huecos, desplazamientos (PVC o placas), humedad y filtraciones?', 'Verificar en el sitio
Consulta de convocatorias abiertas con plan de acción para resolver', '3 - No se encontraron anomalías.
1 - Algunas anomalías encontradas, pero todas mapeadas con un plan de acción generando visibilidad con seguimiento.
0 - Plan de acción inconsistente y/o anomalías no mapeadas', '6) All Management', 1.0, false, 12),
  ('3.3', 3, 'CONSERVACION CIVIL', 'FUNDAMENTOS', '¿El muro perimetral está libre de huecos, grietas y con pintura en buen estado (cuando está pintado)?', 'Verificar anomalías (huecos, concertinas abolladas, iluminación, etc) y respetar las especificaciones de control patrimonial en las paredes
Consulta de convocatorias abiertas con plan de acción para resolver', '4 - No se encontraron anomalías.
1 - Algunas anomalías encontradas, pero todas mapeadas con un plan de acción generando visibilidad con seguimiento.
0 - Plan de acción inconsistente y/o anomalías no mapeadas', '6) All Management', 3.0, false, 13),
  ('3.4', 3, 'CONSERVACION CIVIL', 'FUNDAMENTOS', '¿Los revestimientos de las paredes de las salas y accesos están libres de huecos y grietas?', 'Compruebe si hay alguna anomalía (pintura envejecida o dañada, moho, agujeros, grietas) en las paredes.
Consulta de convocatorias abiertas con plan de acción para resolver. Consultar plan de accion en rutinas con mantenimiento.', '5 - No se encontraron anomalías.
1 - Algunas anomalías encontradas, pero todas mapeadas con un plan de acción generando visibilidad con seguimiento.
0 - Plan de acción inconsistente y/o anomalías no mapeadas', '6) All Management', 3.0, false, 14),
  ('3.5', 3, 'CONSERVACION CIVIL', 'FUNDAMENTOS', '¿Están en perfecto estado las puertas y ventanas de las areas ?', 'Comprobar si hay alguna anomalía como: pestillo roto, cristales de ventanas rotos, persianas rotas que dejan pasar el sol, aislamientos rotos, puerta pegada o ruido al moverse.
Consulta de convocatorias abiertas con plan de acción para resolver', '6 - No se encontraron anomalías.
1 - Algunas anomalías encontradas, pero todas mapeadas con un plan de acción generando visibilidad con seguimiento.
0 - Plan de acción inconsistente y/o anomalías no mapeadas', '6) All Management', 3.0, false, 15),
  ('4.1', 4, 'ELECTRICIDAD', 'FUNDAMENTOS', '¿Se encuentran en buen estado el tablero principal, paneles de energía, Infraestructura Eléctrica para Distribución de Energía e Iluminación Externa de la Unidad?', '1) ¿La unidad cuenta con un informe técnico válido con las condiciones de infraestructura eléctrica de la unidad? ¿Incluyen comprobar el estado de los tableros? Consultar documentación.
2) ¿Se encuentra en buen estado la infraestructura eléctrica? En caso de anomalía, ¿existe un plan de acción para su tratamiento con plazos coherentes?
3) ¿Se revisa periódicamente la infraestructura eléctrica según lo aconseja un ingeniero eléctrico?
4) Los gabinetes donde están expuestos los tableros son adecuados? Existe riesgo de golpe por alguna maquina o vehiculo? Verifique las condiciones fisicas en la recorrida.
5) Toda la red eléctrica está protegida por bandeja de cables conductores y soportes.', '3 - Unidad con toda la documentación vigente. Instalaciones en perfectas condiciones de uso e inspecciones periódicas realizadas según orientación técnica.
1 - Unidad con toda la documentación vigente. Instalaciones con algunas anomalías que se abordan mediante un plan de acción y revisiones que se llevan a cabo de acuerdo con la orientación técnica.
0 - Unidad sin documentación válida Instalaciones con problemas o sin revisiones.', '6) All Management', 1.0, false, 16),
  ('4.2', 4, 'ELECTRICIDAD', 'FUNDAMENTOS', '¿La iluminación interna y externa está en perfecto estado de funcionamiento? ¿Existe un cronograma de verificación para ellos?', 'A - Realizar un recorrido por las zonas y comprobar si hay lámparas, reflectores, etc. quemados y dañados.
B - ¿La unidad tiene un cronograma definido para verificar las condiciones de iluminación? ¿Cumple con las necesidades de la unidad?
C - Verificar las RACI y SLA definidas para la realización de recorridas y atención de problemas. La unidad debe contar con un análisis y plan de acción para enfrentar los problemas.', '3 - Sin lámparas quemadas o dañadas, unidad con cronograma definido de verificación y SLA y RACI definidos.
1 - No hay lámparas quemadas, sin embargo hay fallas en el cronograma de verificación y no hay un plan de acción consistente para enfrentar las anomalías.
0 - Hay focos quemados, fallas en el cronograma de verificación y plan de acción inconsistente.', '6) All Management', 1.0, false, 17),
  ('4.3', 4, 'ELECTRICIDAD', 'FUNDAMENTOS', '¿Están en buen estado las instalaciones eléctricas como: enchufes, redes y ventiladores? ¿Existe un cronograma de verificación?', 'A - Realizar recorrido por las áreas y verificar si hay equipos quemados y/o dañados.
B - Consultar el cronograma de revisión de las instalaciones eléctricas. La unidad debe tener un control formal de las revisiones.', '3 - Instalaciones eléctricas en buenas condiciones de uso y cronograma de revisiones que se están realizando y registrando.
1 - Instalaciones eléctricas en buen estado, sin embargo no existen fallas en el cronograma de revisión.
0 - Instalaciones eléctricas con problemas.', '6) All Management', 3.0, false, 18),
  ('5.1', 5, 'HIDRÁULICA, ÁREAS MOLHADAS E MOLHÁVEIS', 'FUNDAMENTOS', '¿Están en perfecto estado los baños, vestuarios y comedores?', 'Verificar:
A - Sin olor
B - Inodoros, lavabos y grifos en buen estado de funcionamiento y sin fugas.
C - Duchas en funcionamiento 
D - Armarios, puertas, cerraduras en buen estado
E - Los soportes para jabón, papel y espejos están bien sujetos y libres de defectos.
F - Pisos y baldosas en buen estado.', '3 - Cumplimiento de 6 ítems de verificación
1- Completa de 4 a 5 elementos de verificación
0 - Servicio con menos de 4 elementos de verificación', '6) All Management', 1.0, false, 19),
  ('5.2', 5, 'HIDRÁULICA, ÁREAS MOLHADAS E MOLHÁVEIS', 'FUNDAMENTOS', 'La unidad cuenta con un registro de limpieza y mantenimiento de desagües, rejillas y sistemas de drenaje de aguas pluviales?', '1) ¿La unidad cumple con el cronograma estándar de limpieza y mantenimiento de desagües, rejillas y sistema de drenaje de aguas pluviales? ¿Se ejecuta lo mismo? ¿Se gestiona con acciones en un plan para afrontar anomalías? Realice un recorrido para comprobar si hay fugas y obstrucciones.
2) Entrevistar a algunas personas y verificar si existe registro de anomalías relacionadas con bloqueos y fugas.', '3 - Calendario de limpieza y mantenimiento según norma. Se gestiona mediante un plan de acción. No hay signos de obstrucción o fugas.
1 - No hay signos de obstrucciones ni fugas, pero sí un programa de limpieza defectuoso y ningún plan de acción para el tratamiento.
0 - Existencia de signos de fugas y obstrucciones y falta de cronograma de limpieza y mantenimiento.', '6) All Management', 3.0, false, 20),
  ('5.3', 5, 'HIDRÁULICA, ÁREAS MOLHADAS E MOLHÁVEIS', 'FUNDAMENTOS', '¿El depósito de agua potable de la unidad se encuentra en perfectas condiciones y cuenta con un registro de mantenimiento y limpieza periódica? (Si es aplicable)', '1) ¿Existe un plan para el suministro de agua en caso de escasez? ¿Existe algún informe para el control del PH?
2) ¿Existe un registro visible de las fechas de mantenimiento? ¿Está en buenas condiciones físicas?
3) ¿La unidad realiza mantenimiento y limpieza de acuerdo con las normas de conservación de la salud?
Atención a unidades con pozos ciegos', '3 - Plan de abastecimiento consistente, informe emitido y controlado, registros de caja actualizados, condiciones físicas en buen estado y mantenimiento realizado de acuerdo con normas sanitarias.
1 - Registros al día, condiciones físicas en buen estado, limpieza y mantenimiento según norma, pero no existe plan de abastecimiento en caso de falta de agua.
0 - Sin registros actualizados, malas condiciones físicas, sin mantenimiento y sin plan de suministro.', '6) All Management', 3.0, false, 21),
  ('6.1', 6, 'MANTENIMIENTO PREVENTIVO', 'GERENCIAR PARA MANTENER', '¿La unidad cuenta con un plan de mantenimiento preventivo (con frecuencia y actividades) para cada tipo de equipo y áreas críticas?', 'A - Plan de mantenimiento
B - Equipos críticos: generadores, puertas de acceso, aire acondicionado, tableros eléctricos, puerta de tarimas, línea de vida, cámara frigorífica, bomba de agua y (suministro de hidrantes)
C - Áreas críticas: tanque de suministro, techos.
D - Frecuencia de actividades preventivas (según tabla de áreas)
E - Servicios a realizar para cada tipo de mantenimiento (con al menos las recomendaciones contenidas en el manual del equipo cuando corresponda', '3. Hay un plan y se sigue.
1. Existe un plan, pero no siempre se sigue.
0. No hay pruebas.', '6) All Management', 3.0, false, 22),
  ('6.2', 6, 'MANTENIMIENTO PREVENTIVO', 'GERENCIAR PARA MANTENER', '¿La unidad utiliza el aprendizaje del mantenimiento correctivo para actualizar los planes de mantenimiento preventivo?', 'A - Verificar el Listado de Mantenimiento Correctivo, con las principales ocurrencias;
B - Consultar planes actualizados
C - Consultar la evolución de los indicadores vinculados a las actualizaciones del plan.', '3 - Los planes de Mantenimiento Preventivo se actualizan con las lecciones aprendidas del Mantenimiento Correctivo y muestran avances.
1 - Los planes de Mantenimiento Preventivo se actualizan con lecciones aprendidas del Mantenimiento Correctivo, pero no muestran avances.
0: los planes no se han actualizado.', '6) All Management', 3.0, false, 23),
  ('7.1', 7, 'GESTION DE COSTOS DE MANTENIMIENTO', 'GERENCIAR PARA MANTENER', '¿Los mantenimientos recurrentes que se realizan en la unidad cuentan con un contrato de prestación de servicios?', 'A. Consultar los contratos (Ej. Consultar contratos de generador, jardinería, aire acondicionado, mantenimiento de portones, etc.)
B- Consultar excepciones aprobadas.
C. Consultar la Matriz de Servicios
D. Verificar ejecución de mantenimiento sin orden ni contrato
E. Comprobar existencia de regularización de facturas', '3-Cuenta con todos los contratos de servicios recurrentes, debidamente aprobados.
1- No cuenta con todos los contratos, sin embargo, están en proceso de aprobación.
0 - No tiene contrato, no está en proceso de aprobación y/o tiene facturas regularizadas', '6) All Management', 3.0, false, 24),
  ('7.2', 7, 'GESTION DE COSTOS DE MANTENIMIENTO', 'GERENCIAR PARA MANTENER', '¿Existe control y estratificación de los mayores gastos por área/equipo/servicio?', 'A - Control actual con historial mínimo de 6 meses.
B - Plan de Accion con seguimiento de los mayores gastos.', '3 - Tiene estratificación abierta por área, con PA y seguimiento para los ítems de mayor impacto.
1 - Tiene estratificación pero con un plan de acción y seguimiento inconsistente.
0 - Sin estratificación.', '6) All Management', 3.0, false, 25),
  ('7.3', 7, 'GESTION DE COSTOS DE MANTENIMIENTO', 'GERENCIAR PARA MANTENER', '¿La unidad cuenta con un paquete de gestión de mantenimiento?', 'A - Verifique si el propietario está monitoreando el resultado (Real x Objetivo y Real x Tendencia).
B - Verificar si el propietario puede explicar los principales impactos.
C - Verificar que la unidad tenga tendencia LE.', '3 - Tiene estratificación de PA y costos de seguimiento.
1 - Tiene estratificación pero no se trata.
0 - Sin estratificación.', '6) All Management', 3.0, false, 26),
  ('7.4', 7, 'GESTION DE COSTOS DE MANTENIMIENTO', 'GERENCIAR PARA MANTENER', '¿La unidad cuenta con áreas internas disponibles para terceros? ¿Tiene evidencia de cargos cuando se identifican reparaciones en el área/estructura de responsabilidad según lo dispuesto en el contrato?', 'A- Verificar la existencia del contrato de las áreas para terceros, exigir la existencia física del préstamo y entrevistar al socio responsable del conocimiento de este contrato.
B - Verificar si las áreas están en buenas condiciones y/o se han realizado todas las reparaciones necesarias.
C - Verificar si las reparaciones a cargo del prestamista han sido debidamente cobradas.', '3 - Se presta y las obras bajo responsabilidad del socio están debidamente cobradas.
1 - Hay préstamos pero no hay cargo.
0 - No tiene préstamos.', '6) All Management', 3.0, false, 27),
  ('7.5', 7, 'GESTION DE COSTOS DE MANTENIMIENTO', 'GERENCIAR PARA MANTENER', '¿La unidad cuenta con un proceso de adquisición de equipamientos y repuestos para realizar las actividades de mantenimiento?', 'A - Presentar control que muestre la contratación de servicios y/o adquisición de repuestos x listado de órdenes de trabajo
B - Evaluar el plazo de cumplimiento de órdenes de trabajo x disponibilidad de materiales', '3 - 90% de las compras completadas <= 30 días desde la apertura de la orden de servicio
1 - 90% de las compras completadas <=60 días desde la apertura de la orden de servicio
0 - No cumple con los requisitos', '6) All Management', 3.0, false, 28),
  ('7.6', 7, 'GESTION DE COSTOS DE MANTENIMIENTO', 'GERENCIAR PARA MANTENER', '¿La unidad posee un proceso definido para el planeamiento del presupuesto de obras, servicios y adquisición de partes?', 'Verificar la existencia de presupuestos estandarizados que contemplen todos los items.

Entrevistar si el dueño entiende los beneficios de realizar un presupuesto estandarizado.

Validar si el servicio discriminado corresponde al presupuestado.

Verificar la aceptación final de la obra refleja el presupuesto aprobado. 

Verificar si  fue prospectado mas de un proveedor.', '3 - Obras y servicios realizados atienden los requisitos de cotización y prospectación presupuestaria.

1 - La unidad posee un proceso definido, pero existen fallas y oportunidades.

0 - No atiende los requisitos.', '6) All Management', 3.0, false, 29),
  ('8.1', 8, 'GESTION DE ORDENES DE SERVICIO', 'GERENCIAR PARA MANTENER', '¿Existe un flujo definido y ampliamente conocido para la herramienta de apertura de tickets?', 'A- Demostrar la disponibilidad de la herramienta y su uso (visión de 6 meses)
2- Entrevista en sitio (mínimo 3 usuarios)', '3-Evidencia de la disponibilidad y uso de la herramienta.
1 -La herramienta existe pero no se está utilizando.
0 - No hay evidencia de uso.', '6) All Management', 3.0, false, 30),
  ('8.2', 8, 'GESTION DE ORDENES DE SERVICIO', 'GERENCIAR PARA MANTENER', '¿La unidad garantiza la gestión de las órdenes de servicio (correctivas y preventivas) con plazo de ejecución, priorización de demandas y seguimiento en reuniones de rutina?', 'A- Verifique su seguimiento
B- comprobar PA en busca de anomalías y servicios desatendidos.', '3-Tiene una planilla de seguimiento y se trata en reunión con un PA y seguimiento.
1 - Tiene estratificación pero no se trata.
0 - Sin estratificación.', '6) All Management', 3.0, false, 31),
  ('8.3', 8, 'GESTION DE ORDENES DE SERVICIO', 'GERENCIAR PARA MANTENER', '¿La unidad lleva a cabo controles con los proveedores de servicios centrándose en la planificación, la ejecución y el nivel de servicio?', 'A- Acta de reunión con desglose de actividades, seguimiento de ejecución y calidad de los servicios.', '3-Tiene evidencia de reunión y PA y seguimiento.
1 - Hay evidencia de una reunión pero no hay negociaciones registradas.
0 - No hay evidencia de una reunión.', '6) All Management', 1.0, false, 32),
  ('9.1', 9, 'NIVEL DE SERVICIO', 'GESTION PARA MEJORAR', '¿La unidad monitorea las encuestas de satisfacción de mantenimiento y servicios generales?', 'A- Verificar si la unidad cuenta con una herramienta de análisis del nivel de servicio.
B- Verificar los datos de la investigación y si tiene estratificación con seguimiento mensual.', '3 - Existe un plan, se realiza seguimiento mensual y se avanza en la investigación
1- Existe un plan de acción para los ítems pero presenta inconsistencias y vacíos
0 - No hace seguimiento', '6) All Management', 1.0, false, 33),
  ('9.2', 9, 'NIVEL DE SERVICIO', 'GESTION PARA MEJORAR', '¿La unidad garantiza los llamados de mantenimiento del predio cerrados en el plazo?', 'A - Estratificación actual de los mantenimientos las llamadas.
B - Entrevista con clientes y verificación en sitio (mínimo 3 clientes)
C - La satisfacción con el servicio realizado es adecuada', '3- 90% de las llamadas cerradas a tiempo y sin inconsistencias en la verificación en sitio
1 - Entre el 70% y el 90% de las llamadas se cerraron a tiempo y hubo inconsistencias en la verificación en sitio
0 - No cumple con los requisitos anteriores', '6) All Management', 3.0, false, 34),
  ('9.3', 9, 'NIVEL DE SERVICIO', 'GESTION PARA MEJORAR', '¿La unidad cuenta con un plan efectivo para comunicar las obras y mantenimiento a realizar?', 'A - Presentar acta de la reunión de inicio de las actividades de mantenimiento que incluya: macro actividades, cronograma, plan de tránsito y áreas a aislar, siendo obligatoria la presencia de los siguientes responsables
B - Entrevista in situ', '3- Acreditar comunicación de trabajos con tratamiento efectivo en reuniones rutinarias.
1 - Comunicación inconsistente y PA con lagunas.
0 - No hay comunicación.', '6) All Management', 3.0, false, 35),
  ('9.4', 9, 'NIVEL DE SERVICIO', 'GESTION PARA MEJORAR', '¿Fue realizado algún benchmark de proceso, indicadores, mejores prácticas o iniciativas con otra operaciones?', 'Verificar el proceso de búsqueda e intercambio de Mejores Prácticas de Mantenimiento entre unidades.

Verificar la evolución, directa o indirecta, del proceso aplicado a la Mejor Práctica.

Verificar los planes de acción.

Verificar el proceso de búsqueda e intercambio de Mejores Prácticas de Mantenimiento entre unidades.

Verificar la evolución, directa o indirecta, del proceso aplicado a la Mejor Práctica.

Verificar los planes de acción.

Verificar el proceso de búsqueda de Mejores Prácticas de Mantenimiento entre unidades.', '3 - La unidad adoptó/ compartió alguna Mejor Práctica y consigue evidencias mejorías en los procesos. 

1 - La unidad adoptó/ compartió alguna Mejor Práctica pero todavía no hubo mejoría en elos procesos. 

0 - No existen evidencias.', '6) All Management', 1.0, false, 36)
ON CONFLICT (codigo) DO NOTHING;

-- SEED · Matriz RACI base (DPO 2.4 Facility Maintenance)
INSERT INTO mant_raci (actividad, grupo, contratista, coord_hsma, analista_hsma, analista_mantenimiento, jefe_cd, orden)
VALUES
  ('Solicitud de trabajo de mantenimiento', 'Solicitud', '', 'C', 'I', 'R', 'A', 0),
  ('Relevamiento de trabajos', 'Solicitud', '', 'I', 'I', 'A', 'R', 1),
  ('Aprobación de Presupuestos', 'Aprobación', '', 'I', 'A', 'C', 'R', 2),
  ('Valoración de riesgo, análisis ARDS', 'Aprobación', 'R', 'A', 'I', 'C', 'I', 3),
  ('Presentación de documentaciones', 'Aprobación', 'R', 'A', 'I', 'C', 'I', 4),
  ('Selección de tipo de medios para el trabajo', 'Aprobación', 'C', 'A', 'I', 'R', 'I', 5),
  ('Aprobación de trabajos', 'Aprobación', '', 'I', 'A', 'C', 'R', 6),
  ('Acompañamiento del trabajo', 'Ejecución', '', 'A', 'I', 'I', 'R', 7),
  ('Cierre del trabajo', 'Cierre', '', 'I', 'I', 'A', 'R', 8)
ON CONFLICT DO NOTHING;

-- SEED · Criterios de evaluación de proveedores (editables)
INSERT INTO mant_eval_criterios (texto, descripcion, orden, activo)
VALUES
  ('Calidad del trabajo realizado', '¿La tarea ejecutada cumplió con la calidad técnica y los estándares esperados?', 1, true),
  ('Cumplimiento de plazos', '¿Respetó las fechas comprometidas y los tiempos de respuesta acordados?', 2, true),
  ('Relación calidad-precio', '¿El presupuesto presentado fue competitivo y proporcional al servicio entregado?', 3, true),
  ('Atención y comunicación', '¿Mantuvo comunicación clara, respondió consultas y resolvió imprevistos con criterio?', 4, true),
  ('Seguridad y normas (HSMA)', '¿Cumplió con las normas de seguridad, higiene y medio ambiente del CD durante el trabajo?', 5, true)
ON CONFLICT DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
