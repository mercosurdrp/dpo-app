-- =============================================
-- DPO 5.1 Plan Territorial — la HISTORIA de cada etapa de rutas
-- 21/10/2026
--
-- Sebastián pidió que lo que cuentan las presentaciones (cómo estaba, qué se
-- hizo, cómo viene, qué se espera, con los mapas) esté en la página y no sólo
-- como PPT para descargar. Cada etapa suma tres textos y una lista de
-- imágenes (ya subidas al bucket dpo-evidencia, planeamiento/5.1/historia/).
-- =============================================

ALTER TABLE territorial_rediseno_rutas
  ADD COLUMN IF NOT EXISTS antes_texto    text,
  ADD COLUMN IF NOT EXISTS cambio_texto   text,
  ADD COLUMN IF NOT EXISTS esperado_texto text,
  ADD COLUMN IF NOT EXISTS imagenes       jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN territorial_rediseno_rutas.antes_texto IS
  'Historia, parte 1: cómo se atendía la ciudad antes de esta etapa (texto libre).';
COMMENT ON COLUMN territorial_rediseno_rutas.cambio_texto IS
  'Historia, parte 2: qué se hizo y por qué. Si está vacío la página muestra justificacion.';
COMMENT ON COLUMN territorial_rediseno_rutas.esperado_texto IS
  'Historia, parte 4: qué se espera (meta, carga por día estimada, qué se mide).';
COMMENT ON COLUMN territorial_rediseno_rutas.imagenes IS
  'Mapas y gráficos de la etapa: [{path, titulo, momento}] con momento = antes | cambio | esperado. '
  'path es la clave en el bucket dpo-evidencia; la app firma la URL al leer.';

-- ---------------------------------------------
-- Datos: Colón etapa 1 y 2, Ramallo etapa 1
-- ---------------------------------------------

UPDATE territorial_rediseno_rutas SET
  antes_texto = 'Las entregas a Colón salían de lunes a viernes sin esquema fijo. El jueves era el día más cargado fuera de cualquier esquema (22 % de las entregas) y el lunes también sumaba. De enero al 9 de agosto sólo el 68 % de las entregas caía en martes, miércoles o viernes, y el camión repetía recorridos por la misma zona: 4 o 5 viajes por semana de unos 280 km cada uno. Julio cerró en 42.716 $/HL y la línea base enero–julio fue 37.727 $/HL.
La visita de los promotores ya estaba ordenada en 6 rutas: Gustavo Pérez 4011 (los pueblos: Carabelas, Mariano H. Alfonzo y El Arbolito), 4012 y 4013; Fernando Lugo 4021, 4022 y 4023. El día de visita lo marca el sufijo: LUJU, MAVI o MISA.',
  cambio_texto = 'Desde el 10 de agosto de 2026 el reparto a Colón, Carabelas, Mariano H. Alfonzo y El Arbolito se concentra en tres días: martes, miércoles y viernes, un viaje por día. Los días se alinearon con las rutas de visita existentes, así cada pedido tiene su día de entrega fijo. La visita de los promotores no cambió.
Medido con las entregas reales de Chess en las primeras cinco semanas: adherencia a los tres días 68 % → 93 % (98 % sin la semana de cierre de mes); jueves 962 → 3 entregas; lunes 433 → 33, de las cuales 30 son del lunes 31/08, cierre de mes. Paradas por viaje 28 → 38. Las seis rutas de visita mejoraron; la que menos adhiere es la 4012 de Gustavo (87 %).
Quedó para definir qué pasa con el cierre de mes cuando cae fuera de martes, miércoles o viernes: abrir ese lunes o adelantar al viernes.',
  esperado_texto = 'Meta: 35.841 $/HL, un 5 % por debajo de la línea base enero–julio. Agosto, primer mes completo con el esquema, dio 34.431 $/HL, ya por debajo de la meta.
La iniciativa de ahorro «Reparto en Colón» compromete $3,6 M entre agosto y diciembre por pasar de 4 a 3 viajes por semana. Seguimiento semanal con un solo número: % de entregas en martes, miércoles o viernes.',
  imagenes = '[{"path": "planeamiento/5.1/historia/2b55cf3f-ab74-4a4c-a057-986268795ffa/01-semanas-2026.png", "titulo": "Las 37 semanas de 2026: hasta el 9 de agosto todas tienen jueves (rojo) y casi todas lunes (naranja)", "momento": "antes"}, {"path": "planeamiento/5.1/historia/2b55cf3f-ab74-4a4c-a057-986268795ffa/02-zonas-colon.png", "titulo": "Las 3 zonas de Colón: franjas paralelas al Boulevard 50", "momento": "antes"}, {"path": "planeamiento/5.1/historia/2b55cf3f-ab74-4a4c-a057-986268795ffa/03-adherencia.png", "titulo": "Adherencia a martes, miércoles y viernes semana a semana: 68 % antes, 93 % en las 5 semanas posteriores", "momento": "cambio"}, {"path": "planeamiento/5.1/historia/2b55cf3f-ab74-4a4c-a057-986268795ffa/04-ruta-gustavo.png", "titulo": "Rutas de visita de Gustavo Pérez (4011 pueblos, 4012, 4013)", "momento": "cambio"}, {"path": "planeamiento/5.1/historia/2b55cf3f-ab74-4a4c-a057-986268795ffa/05-ruta-fernando.png", "titulo": "Rutas de visita de Fernando Lugo (4021, 4022, 4023)", "momento": "cambio"}]'::jsonb,
  updated_at = now()
WHERE id = '2b55cf3f-ab74-4a4c-a057-986268795ffa';

UPDATE territorial_rediseno_rutas SET
  antes_texto = 'Con los tres días de entrega funcionando, el viernes quedó como el día más pesado: 47 clientes y 736 bultos por semana (pico 818), contra 32 clientes y 324 bultos el miércoles. Los pueblos se repartían en dos días: Carabelas el miércoles, y Mariano H. Alfonzo y El Arbolito el viernes, todos con visita del lunes. Eso obligaba a salir dos veces por semana hacia los pueblos.
Dentro de Colón, el bloque del ingreso (lado de los pueblos) recibía el miércoles con pedidos del sábado (Gustavo) o del lunes (Fernando).',
  cambio_texto = 'Desde el 6 de octubre de 2026 los tres pueblos se entregan juntos el miércoles, en un solo viaje. Para no recargar ese día, sólo el bloque sur del ingreso (15 clientes: 6 de Gustavo y 9 de Fernando) pasa a visita miércoles con entrega viernes; el norte (Barrio 9 de Julio) sigue recibiendo el miércoles.
Fernando completa su lunes con 9 clientes de la 4023 cercanos al bloque norte más Gonella: sus rutas quedan 4021 LU-JU 24 → 25 y 4023 MI-SA 27 → 26. Gustavo mantiene la REV.05: sus 6 ya están en la 4013, el miércoles toma el pedido y el sábado queda como reposición. Ningún cliente cambia de promotor y el martes no se toca.',
  esperado_texto = 'Estimado con las entregas reales de 8 semanas (10/08 al 04/10) puestas en el día nuevo de cada cliente: miércoles 32 → 37 clientes y 324 → 430 bultos por semana (pico 560, 11,6 bultos de los pueblos); viernes 47 → 42 clientes y 736 → 629 bultos (pico 818); martes sin cambio, 454 bultos.
La meta de $/HL de Colón sigue siendo 35.841. Octubre es el primer mes que mide esta etapa; septiembre (47.548) fue todavía con el esquema anterior y con la rotura de un camión que encareció toda la red.',
  imagenes = '[{"path": "planeamiento/5.1/historia/b6f759d3-d773-4d6b-a6f4-3a2054c83366/01-mapa-general-hoy.png", "titulo": "Mapa general hoy: Colón y los pueblos por día de entrega", "momento": "antes"}, {"path": "planeamiento/5.1/historia/b6f759d3-d773-4d6b-a6f4-3a2054c83366/02-colon-hoy.png", "titulo": "Colón hoy: día de entrega principal de cada cliente (● Gustavo ■ Fernando)", "momento": "antes"}, {"path": "planeamiento/5.1/historia/b6f759d3-d773-4d6b-a6f4-3a2054c83366/03-mapa-general-propuesta.png", "titulo": "Propuesta: los 3 pueblos juntos el miércoles", "momento": "cambio"}, {"path": "planeamiento/5.1/historia/b6f759d3-d773-4d6b-a6f4-3a2054c83366/04-colon-propuesta.png", "titulo": "Colón propuesta: los 15 anillados pasan de recibir el miércoles a recibir el viernes", "momento": "cambio"}, {"path": "planeamiento/5.1/historia/b6f759d3-d773-4d6b-a6f4-3a2054c83366/05-bultos-por-dia.png", "titulo": "Bultos por día de entrega, hoy vs propuesta (raya roja = semana más cargada)", "momento": "esperado"}]'::jsonb,
  updated_at = now()
WHERE id = 'b6f759d3-d773-4d6b-a6f4-3a2054c83366';

UPDATE territorial_rediseno_rutas SET
  antes_texto = 'El reparto salía los seis días y en 4 de los 6 el camión pasaba por Ramallo y por Villa Ramallo en el mismo viaje. Las rutas de visita de Chess mezclaban las dos localidades el mismo día: Juan Pablo Rodríguez visitaba Villa LU-JU (56 clientes, con tope 40), Ramallo + Villa MA-VI (49) y Ramallo MI-SA (35, con tope 23 el sábado); Iván Oulego, Villa LU-JU (18), Ramallo + Villa MA-VI (11) y Ramallo MI-SA (24).
Promedio de 8 semanas: 134 entregas y 1.940 bultos por semana, repartidos en LU 13,6 · MA 15,9 · MI 23,6 · JU 20,9 · VI 32,0 · SA 28,1 entregas. Línea base enero–agosto: 9.409 $/HL.',
  cambio_texto = 'Desde el 5 de octubre de 2026 cada localidad tiene su día. Villa Ramallo se visita lunes y jueves y se entrega toda junta miércoles y sábado: Juan Pablo mantiene 2 visitas a sus 23 principales (ranking 50 % bultos + 50 % mix) y pasa 17 a sólo lunes (oeste) y 17 a sólo jueves (este); Iván sigue con 24 LU y JU.
Ramallo se parte en dos zonas con una línea de corte común para los dos promotores: MAVI (Juan Pablo 42, Iván 15), con entrega jueves y martes, y MISA (Juan Pablo 23 + 18 sólo miércoles, Iván 14), con entrega viernes y martes. El camión del jueves y el del viernes recorren cada uno su mitad del pueblo. El lunes queda sin reparto, libre para ventas adicionales de volumen.
71 de 193 clientes cambian de día de visita; ninguno cambia de promotor. Orden de visita por cercanía, con topes de 40 por día y 23 el sábado.',
  esperado_texto = 'Reparto estimado con los pedidos reales de 8 semanas reubicados en el día nuevo: MA 28,4 · MI 26,1 · JU 20,6 · VI 28,8 · SA 27,2 entregas por semana (131 en total), de 6 viajes semanales a 5 y cada uno por una sola localidad. El miércoles de Villa es el más pesado (~540 bultos).
Meta: 8.939 $/HL, un 5 % por debajo de la línea base enero–agosto. Octubre es el primer mes que mide esta etapa; septiembre (10.894) fue todavía con el esquema anterior y con la rotura de un camión que encareció toda la red.',
  imagenes = '[{"path": "planeamiento/5.1/historia/117e688a-d5d2-448d-9a5a-b15672237b41/01-hoy-lunes-visitas.png", "titulo": "Hoy, lunes: visitas de Juan Pablo (●) y de Iván (■) en Villa Ramallo", "momento": "antes"}, {"path": "planeamiento/5.1/historia/117e688a-d5d2-448d-9a5a-b15672237b41/02-hoy-lunes-entrega.png", "titulo": "Hoy, lunes: entregas según Chess, Ramallo y Villa Ramallo en el mismo día", "momento": "antes"}, {"path": "planeamiento/5.1/historia/117e688a-d5d2-448d-9a5a-b15672237b41/03-ramallo-zonas.png", "titulo": "Ramallo en 2 zonas con corte común: MAVI (entrega JU y MA) y MISA (entrega VI y MA)", "momento": "cambio"}, {"path": "planeamiento/5.1/historia/117e688a-d5d2-448d-9a5a-b15672237b41/04-villa-ramallo.png", "titulo": "Villa Ramallo: visita LU y JU, entrega MI y SA (★ 23 principales de Juan Pablo)", "momento": "cambio"}, {"path": "planeamiento/5.1/historia/117e688a-d5d2-448d-9a5a-b15672237b41/05-jp-sabado.png", "titulo": "Recorrido de Juan Pablo el sábado: sólo los 23 principales de MISA, 5,3 km", "momento": "cambio"}]'::jsonb,
  updated_at = now()
WHERE id = '117e688a-d5d2-448d-9a5a-b15672237b41';

-- Verificación
SELECT etapa, titulo, length(antes_texto) antes, length(cambio_texto) cambio, length(esperado_texto) esperado, jsonb_array_length(imagenes) imgs
FROM territorial_rediseno_rutas ORDER BY plan_id, etapa;
