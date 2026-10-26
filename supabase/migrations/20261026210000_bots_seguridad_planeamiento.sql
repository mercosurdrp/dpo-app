-- =============================================================================
-- Bots por pilar: Seguridad y Planeamiento
-- =============================================================================
-- Igual que Flota, no tienen grilla de reunión: reunion_tipo es una fuente
-- virtual (ver src/lib/bots/contexto-seguridad.ts y contexto-planeamiento.ts).
--   seguridad     reportes de seguridad y sus planes (/reportes-seguridad)
--   planeamiento  cobertura de stock por SKU de la rutina de Pronóstico
-- telefono admite varios números separados por coma. El encargado (a quien se
-- asignan los planes aprobados) queda en Fausto hasta cargar el de cada pilar.
-- =============================================================================

INSERT INTO bots_pilar (key, nombre, emoji, reunion_tipo, indicadores, encargado_profile_id, telefono, prompt_extra)
VALUES
(
  'seguridad',
  'Seguridad',
  '🦺',
  'seguridad',
  '{}',
  (SELECT id FROM profiles WHERE email = 'fazzaretti@mercosurdrp.com.ar' LIMIT 1),
  '5493406420544,5493751375391',
  'Indicadores de los reportes de seguridad (actos inseguros, incidentes, accidentes, rutas de riesgo), fotos al día de hoy: Días sin accidentes; Planes de seguridad vencidos = acciones de un reporte con fecha planificada pasada y sin completar; Reportes SIF sin plan = reportes con potencial de lesión grave o fatal (SIF) de los últimos 30 días que no tienen ninguna acción cargada. Como comentario de cada línea usá el valor actual o la novedad que lo explique (no inventes rachas ni tendencias). Las novedades del día (reportes nuevos, planes vencidos) las agrega el sistema debajo: NO las repitas en las líneas, pero usalas para los planes: si se repite un mismo tipo de acto inseguro (ej. roturas al bajar cajones), proponé atacar la causa común. Los roles posibles son Responsable de Seguridad e Higiene, Supervisor de Distribución, Supervisor de Almacén y Jefe de Flota.'
),
(
  'planeamiento',
  'Planeamiento',
  '📈',
  'planeamiento',
  '{}',
  (SELECT id FROM profiles WHERE email = 'fazzaretti@mercosurdrp.com.ar' LIMIT 1),
  '5493751375390',
  'Indicadores de cobertura de stock de la rutina de Pronóstico (DPO Planeamiento 3.2), foto de hoy: SKUs sin stock con venta = quiebres (stock 0 y venta promedio de los últimos 15 días); SKUs debajo de la cobertura mínima = % de SKUs con menos días de stock que el mínimo de la política de su segmento (cervezas 6, UNG 6, aguas 8, otros 8 días); SKUs encima de la máxima = sobrestock (informativo). Como comentario de cada línea usá el valor actual o la novedad que lo explique (no inventes rachas ni tendencias). La lista de SKUs en quiebre o con cobertura crítica la agrega el sistema debajo: NO la repitas, pero usala para los planes (ej. pedido urgente a la cervecería o redistribución). Los roles posibles son Analista de Planeamiento, Responsable de Compras / Abastecimiento y Jefe de Depósito.'
)
ON CONFLICT (key) DO NOTHING;
