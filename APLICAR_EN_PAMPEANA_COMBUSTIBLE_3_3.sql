-- ============================================================================
-- DPO Flota 3.3 «Consumo de combustible» · aplicar en el SQL editor de Pampeana
-- (y repetir en Misiones si el módulo de combustible se usa allá).
-- 06/11/2026. Idempotente: se puede correr dos veces.
-- ============================================================================

-- 1) PIs nuevos del tablero de Indicadores de Flota (ver la migración
--    20261106100000_combustible_pis_dpo_3_3.sql).
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('combustible_sin_registrar_l', 0, '<=', 'L',
   'PI de pérdida de combustible (DPO 3.3): litros cargados sin registrar en la app, detectados porque el tramo siguiente rinde más de 1,4× lo habitual del camión. Mientras haya cargas sin registrar el km/l está inflado y el costo por km, subestimado. Meta 0: la política de combustible exige registrar cada carga en el momento, con odómetro y ticket.'),
  ('combustible_camiones_sin_carga_7d', 0, '<=', '#',
   'Condición de la meta de km/l (fijada el 31/08/2026): una carga cada 7 días o menos por camión de reparto. Un hueco mayor es un camión parado sin avisar o una carga que no pasó por la app, y en los dos casos el rendimiento del mes deja de ser comparable. Meta 0 camiones.')
ON CONFLICT (kpi) DO UPDATE SET
  meta = EXCLUDED.meta,
  comparador = EXCLUDED.comparador,
  unidad = EXCLUDED.unidad,
  justificacion = COALESCE(flota_metas.justificacion, EXCLUDED.justificacion);

-- 2) Justificación del KPI principal (R3.3.3 pide justificar la elección).
--    Reemplaza la justificación larga del 31/08 por una que el auditor pueda
--    leer en la tarjeta: por qué km/l por camión y no otro.
UPDATE flota_metas SET justificacion =
  'KPI elegido para DPO 3.3: km por litro de la flota de reparto (Σ km ÷ Σ litros de las cargas con medición, sin los tramos con carga faltante ni los autoelevadores). Se eligió por camión porque es lo que mueve el rubro COMBUSTIBLE: GASOIL del presupuesto (el segundo gasto de flota) y lo que el chofer controla con su forma de manejar; el litro por HL vendido depende del mix de rutas y el costo por km, del precio del gasoil, que la operación no maneja. Meta 3,75 para sep–nov 2026 (base 3,56 antes del limitador de velocidad del 06/07/2026, 3,64 en agosto): cada camión sostiene lo de agosto, los tres rezagados suben a un piso de 3,50 y larga distancia a 3,75. Vale ≈ 276 l/mes ≈ $7,3 M/año a $2.210/l. Se acompaña con dos PI de pérdida: litros sin registrar (meta 0) y camiones con más de 7 días sin carga (meta 0). El 3,95 de la iniciativa Limitadores queda como meta 2027.'
WHERE kpi = 'combustible_kml';

-- 3) Plan de acción de combustible (R3.3.4): octubre cerró en 3,64 contra 3,75.
--    Se crea abierto; las tareas se cierran desde Indicadores → Planes de acción.
WITH plan AS (
  INSERT INTO flota_plan_accion (kpi, mes, year, valor_mes, meta_mes, causa_raiz, estado)
  VALUES (
    'combustible_kml', 10, 2026, 3.64, 3.75,
    'Octubre cerró en 3,64 km/l contra la meta de 3,75 y el año está plano (3,57 abr · 3,65 ago · 3,51 sep · 3,64 oct): el limitador de velocidad (06/07) dio +2 % y ahí se frenó. Tres causas, por peso: (1) tres camiones rezagados que no mejoraron con el limitador —AF588SU 3,12, AE591EI 3,32 y AE908DG 3,40 en los últimos 90 días— y el AC165AJ en 2,83; cada uno tiene un chofer fijo, así que el margen está en la conducción (ralentí, régimen, anticipación) y en la presión de neumáticos, no en el camión. (2) Cargas sin registrar: 3 a 7 por mes (300 a 800 litros) que inflan el km/l y esconden consumo; nadie avisaba en el momento. (3) Huecos de 9 a 20 días entre cargas en varios camiones, con lo que el rendimiento del mes se mide sobre pocos tramos. Las dos últimas son de registro y se atacan con la política de combustible nueva y el aviso de carga faltante de la app; la primera, con instrucción individual al chofer y revisión de neumáticos.',
    'abierto'
  )
  ON CONFLICT (kpi, year, mes) DO NOTHING
  RETURNING id
), p AS (
  SELECT id FROM plan
  UNION ALL
  SELECT id FROM flota_plan_accion WHERE kpi = 'combustible_kml' AND year = 2026 AND mes = 10
  LIMIT 1
)
INSERT INTO flota_plan_accion_items (plan_id, accion, responsable, fecha_compromiso, orden)
SELECT p.id, i.accion, i.responsable, i.fecha::date, i.orden
FROM p, (VALUES
  ('Publicar la Política / SOP de Gestión de Combustible en /sops (pilar Flota) y en la Teamroom, basada en el GOP Combustible de AB-InBev.', 'Fausto Azzaretti', '2026-11-12', 0),
  ('Capacitar a los 11 choferes de reparto en la Política de Combustible y conducción eficiente (OPL) con asistencia firmada y cuestionario; registrar en /capacitaciones vinculada al punto 3.3.', 'Fausto Azzaretti', '2026-11-13', 1),
  ('Instrucción individual a los choferes de AF588SU, AE591EI y AE908DG con su km/l de los últimos 3 meses contra el piso 3,50: ralentí, régimen 1.200–1.600 rpm, anticipación de frenado y presión de neumáticos. Dejar constancia en la capacitación.', 'Supervisor de Flota', '2026-11-14', 2),
  ('Verificar presión de neumáticos y estado de filtros de aire y combustible de AF588SU, AE591EI, AE908DG y AC165AJ en el próximo CIL / service y registrar la OT.', 'Supervisor de Flota', '2026-11-14', 3),
  ('Cerrar las cargas sin registrar de octubre (4 tramos, ≈ 584 L): identificar la carga faltante con el chofer y cargarla con su fecha y odómetro.', 'Supervisor de Flota', '2026-11-11', 4),
  ('Conciliar los litros registrados en la app contra la factura de Axion de octubre y dejar el resultado como litros sin registrar del mes (PI de pérdida).', 'Administración', '2026-11-17', 5),
  ('Asignar los camiones de menor rendimiento a las rutas más cortas del ruteo semanal mientras no alcancen el piso (GOP 819) y revisar el efecto en el km/l de noviembre.', 'Supervisor de Ruta', '2026-11-28', 6)
) AS i(accion, responsable, fecha, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM flota_plan_accion_items x WHERE x.plan_id = p.id AND x.accion = i.accion
);

-- 4) Nombres de chofer fuera del catálogo en las cargas (texto libre).
UPDATE registro_combustible SET chofer = 'TEVES JORGE EZEQUIEL'
WHERE upper(btrim(chofer)) IN ('EZEQUIEL TEVES', 'TEVES EZEQUIEL');
UPDATE registro_combustible SET chofer = 'RIVERO EZEQUIEL'
WHERE upper(btrim(chofer)) = 'EZEQUIEL RIVERO';
UPDATE registro_combustible SET chofer = 'RIVERO FEDERICO'
WHERE upper(btrim(chofer)) = 'FEDERICO RIVERO';
UPDATE registro_combustible SET chofer = 'RIVERO LAUREANO'
WHERE upper(btrim(chofer)) IN ('LAUREANO', 'LAUREANO.RIVERO', 'LAUREANO RIVERO');

-- 5) Capacitación «Política de Combustible y Conducción eficiente» (R3.3.2,
--    GOP 813/814): reprograma la fila del 28/08 que quedó sin dictar, o la crea;
--    carga el cuestionario de 5 preguntas y la vincula al punto 3.3 de Flota.
--    La asistencia se toma desde /capacitaciones el día que se dicta.
WITH existente AS (
  UPDATE capacitaciones SET
    titulo = 'Política de Combustible y Conducción eficiente (DPO Flota 3.3)',
    descripcion = 'Política de Combustible de Mercosur Región Pampeana (SOP Gestión de Combustible de Flota, Rev. 01, basado en el GOP Combustible de AB InBev): dónde, cuándo y cómo se carga; registro en la app en el momento y aviso de carga faltante; km/l por camión y por chofer, meta 3,75 y piso 3,50; OPL de conducción eficiente (8 comportamientos). Cuestionario de 5 preguntas, aprueba con 4. Asistencia firmada escaneada como evidencia.',
    instructor = 'Fausto Azzaretti',
    fecha = DATE '2026-11-12',
    duracion_horas = 0.5,
    lugar = 'Matinal · CD Mercosur',
    estado = 'programada',
    updated_at = now()
  WHERE estado <> 'completada'
    AND (titulo ILIKE '%combustible%' AND titulo ILIKE '%neum%')
  RETURNING id
), nueva AS (
  INSERT INTO capacitaciones (titulo, descripcion, instructor, fecha, duracion_horas, lugar, estado)
  SELECT
    'Política de Combustible y Conducción eficiente (DPO Flota 3.3)',
    'Política de Combustible de Mercosur Región Pampeana (SOP Gestión de Combustible de Flota, Rev. 01, basado en el GOP Combustible de AB InBev): dónde, cuándo y cómo se carga; registro en la app en el momento y aviso de carga faltante; km/l por camión y por chofer, meta 3,75 y piso 3,50; OPL de conducción eficiente (8 comportamientos). Cuestionario de 5 preguntas, aprueba con 4. Asistencia firmada escaneada como evidencia.',
    'Fausto Azzaretti', DATE '2026-11-12', 0.5, 'Matinal · CD Mercosur', 'programada'
  WHERE NOT EXISTS (SELECT 1 FROM existente)
    AND NOT EXISTS (SELECT 1 FROM capacitaciones WHERE titulo LIKE 'Política de Combustible y Conducción eficiente%')
  RETURNING id
), cap AS (
  SELECT id FROM existente UNION ALL SELECT id FROM nueva
  UNION ALL SELECT id FROM capacitaciones WHERE titulo LIKE 'Política de Combustible y Conducción eficiente%'
  LIMIT 1
), preg AS (
  INSERT INTO capacitacion_preguntas (capacitacion_id, texto, opciones, respuesta_correcta, orden)
  -- La app guarda `opciones` como JSON.stringify(array) dentro del jsonb (un
  -- string JSON), así que acá va igual: to_jsonb(texto), no ::jsonb.
  SELECT cap.id, q.texto, to_jsonb(q.opciones::text), q.correcta, q.orden
  FROM cap, (VALUES
    ('¿Cuándo tenés que registrar la carga de combustible en la app?',
     '["Al final de la semana, todas juntas","En el momento, en la playa de la estación, con el ticket en la mano","Cuando lo pida el Supervisor de Flota","Sólo si el tanque quedó lleno"]', 1, 0),
    ('La app te avisa «parece faltar una carga anterior». ¿Qué hacés?',
     '["Nada, el aviso es informativo","Borro la carga y la vuelvo a cargar con menos litros","Registro la carga que faltó con su fecha real, su odómetro y sus litros, o aviso al Supervisor si no me acuerdo","Le resto los litros a la próxima carga"]', 2, 1),
    ('¿En qué régimen de motor se consume menos?',
     '["Entre 800 y 1.000 rpm","Entre 1.200 y 1.600 rpm (zona verde)","Entre 2.000 y 2.500 rpm","Da lo mismo, depende del camión"]', 1, 2),
    ('Llegás al cliente y la descarga va a tardar. ¿Qué hacés con el motor?',
     '["Lo dejo en ralentí para que no se enfríe","Lo apago si la parada dura más de 3 minutos","Lo acelero un poco para cargar la batería","Lo apago sólo si hace calor"]', 1, 3),
    ('¿Cuál es la meta de rendimiento de la flota y el piso por camión y por chofer?',
     '["2,50 km/l y 2,00 km/l","3,75 km/l y 3,50 km/l","4,50 km/l y 4,00 km/l","No hay meta, se mira el gasto"]', 1, 4)
  ) AS q(texto, opciones, correcta, orden)
  WHERE NOT EXISTS (SELECT 1 FROM capacitacion_preguntas x WHERE x.capacitacion_id = cap.id)
  RETURNING id
)
INSERT INTO capacitacion_dpo_puntos (capacitacion_id, pregunta_id)
SELECT cap.id, p.id
FROM cap
JOIN bloques b ON TRUE
JOIN pilares pi ON pi.id = b.pilar_id AND pi.nombre ILIKE 'flota'
JOIN preguntas p ON p.bloque_id = b.id AND p.numero = '3.3'
ON CONFLICT (capacitacion_id, pregunta_id) DO NOTHING;

-- Verificación
SELECT kpi, meta, comparador, unidad FROM flota_metas WHERE kpi LIKE 'combustible%';
SELECT c.titulo, c.fecha, c.estado, count(q.id) AS preguntas,
       (SELECT count(*) FROM capacitacion_dpo_puntos d WHERE d.capacitacion_id = c.id) AS puntos_dpo
FROM capacitaciones c LEFT JOIN capacitacion_preguntas q ON q.capacitacion_id = c.id
WHERE c.titulo LIKE 'Política de Combustible y Conducción eficiente%' GROUP BY c.id;
SELECT p.kpi, p.mes, p.year, p.estado, count(i.id) AS items
FROM flota_plan_accion p LEFT JOIN flota_plan_accion_items i ON i.plan_id = p.id
WHERE p.kpi = 'combustible_kml' GROUP BY p.id, p.kpi, p.mes, p.year, p.estado;
