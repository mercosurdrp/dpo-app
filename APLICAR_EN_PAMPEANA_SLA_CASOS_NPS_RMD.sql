-- =============================================================
-- SLA de cierre de casos NPS (ent_nps) y RMD (ent_rmd) · R4.1.5
--
-- El manual pide medir "el tiempo promedio desde la recolección de RMD o
-- quejas de clientes hasta su cierre, dentro de SLA". Se parte en DOS acuerdos
-- —uno por encuesta— porque en la app NPS y RMD son módulos separados, con su
-- propia base de encuestas y sus propios planes de acción.
--
-- Plazos pactados (07-08-2026), contados desde la FECHA DE LA ENCUESTA:
--   · detractor → cierre del plan dentro de los 30 días corridos
--   · pasivo    → cierre del plan dentro de los 45 días corridos
-- En NPS la categoría viene de la encuesta (Detractor / Passive); en RMD sale
-- de la puntuación: 1-3 detractor, 4 pasivo, 5 promotor (no genera caso).
--
-- El cálculo vive en la app (src/actions/sla.ts, filaCasos): esta migración
-- solo da de alta los dos acuerdos en el catálogo e indexa lo que se consulta.
--
-- APLICAR EN: Supabase PAMPEANA — proyecto `dpo` (ref tpafgmbhnucdiavvxbcg)
-- NO aplicar en Misiones (`dpo-distribucions`): NPS y RMD son sólo de Pampeana.
--
-- 🚨 SIN BEGIN/COMMIT a propósito: el SQL Editor de Supabase ya envuelve todo
-- en una transacción, y un BEGIN explícito puede terminar en rollback
-- silencioso. Todo es idempotente: se puede correr más de una vez.
-- =============================================================

-- 1) ent_rmd ya existía sembrado en 088_sla como "SLA de cierre de RMD /
--    quejas de clientes", cubriendo NPS y RMD juntos. Ahora es solo el de RMD.
--    Las partes venían invertidas del seed (proveedor = 'Cliente', o sea que
--    el punto de venta se comprometía con nosotros). En este catálogo el
--    PROVEEDOR es quien se compromete y puede incumplir, y el CLIENTE quien
--    reclama: en RMD se compromete Distribución y reclama Ventas, que es la
--    cara ante el PDV. El punto de venta es el beneficiario final, no la parte.
UPDATE slas
SET nombre = 'SLA de cierre de casos RMD',
    parte_cliente = 'Ventas',
    parte_proveedor = 'Entrega / Distribución',
    descripcion = 'Toda entrega puntuada 1-4 en Rate My Delivery abre un caso. '
      || 'Se cierra con el plan de acción del cliente: 30 días corridos para una '
      || 'puntuación detractora (1-3) y 45 para una pasiva (4), contados '
      || 'desde la fecha de la puntuación.',
    updated_at = now()
WHERE codigo = 'ent_rmd';

-- 2) El gemelo de NPS, que no estaba en el catálogo.
--    Proveedor COMPARTIDO: el NPS no se mueve sólo por drivers comerciales,
--    también por los de entrega, así que se comprometen las dos áreas. Cliente
--    es Gerencia, que responde por el indicador ante la marca y es quien tiene
--    con qué reclamar si los casos no se cierran.
INSERT INTO slas (codigo, nombre, pilar, parte_cliente, parte_proveedor,
                  requisito_manual, descripcion, es_predefinido, orden)
VALUES (
  'ent_nps',
  'SLA de cierre de casos NPS',
  'entrega',
  'Gerencia',
  'Ventas / Logística',
  'R4.1.5',
  'Toda encuesta NPS que deja al cliente detractor o pasivo abre un caso. Se '
    || 'cierra con el plan de acción del cliente: 30 días corridos para un '
    || 'detractor y 45 para un pasivo, contados desde la fecha de la '
    || 'encuesta.',
  true,
  11
)
ON CONFLICT (codigo) DO NOTHING;

-- 🚨 El INSERT de arriba no toca la fila si ya existe, así que las partes de
-- un ent_nps sembrado antes de esta corrección quedarían con los valores
-- viejos. Se fuerzan acá, que además deja la migración auto-correctiva si se
-- vuelve a correr.
UPDATE slas
SET parte_cliente = 'Gerencia',
    parte_proveedor = 'Ventas / Logística',
    updated_at = now()
WHERE codigo = 'ent_nps'
  AND (parte_cliente IS DISTINCT FROM 'Gerencia'
       OR parte_proveedor IS DISTINCT FROM 'Ventas / Logística');

-- 3) Orden de la lista: ent_nps entra pegado a ent_rmd, en el pilar de Entrega,
--    y todo lo que venía después corre un lugar. Se reasignan los códigos de
--    una vez, con valores absolutos, para que correr la migración dos veces
--    deje siempre la misma numeración (un UPDATE relativo, +1, no lo sería).
--    plan_equipos_frio venía empatado en 16 con ges_instalaciones: queda al
--    final, donde ya se mostraba, pero sin el empate.
UPDATE slas s
SET orden = v.orden
FROM (VALUES
  ('plan_syop', 1),
  ('plan_ruteo_tiempo', 2),
  ('plan_ruteo_capacidad', 3),
  ('plan_ruteo_peso', 4),
  ('plan_ruteo_pushed', 5),
  ('plan_datos_maestros', 6),
  ('alm_carga', 7),
  ('alm_recepcion', 8),
  ('alm_mano_obra', 9),
  ('ent_rmd', 10),
  ('ent_nps', 11),
  ('ent_feedback', 12),
  ('flo_checklist', 13),
  ('flo_reunion', 14),
  ('flo_repuestos', 15),
  ('ges_proveedores', 16),
  ('ges_instalaciones', 17),
  ('plan_equipos_frio', 18)
) AS v(codigo, orden)
WHERE s.codigo = v.codigo AND s.orden IS DISTINCT FROM v.orden;

-- 4) Índices de lo que consulta el cálculo mensual.
-- Las encuestas se barren por rango de fecha (todo el mes), no por cliente: el
-- índice compuesto (cod_cliente, fecha_puntuacion) que ya existe no sirve para
-- ese barrido porque la fecha no va primera.
CREATE INDEX IF NOT EXISTS idx_nps_rmd_cliente_fecha
  ON nps_rmd_cliente(fecha_puntuacion);

-- El cierre de un plan es el primer avance que lo dejó en 'completado'.
CREATE INDEX IF NOT EXISTS idx_nps_avances_cierre
  ON nps_planes_avances(plan_id) WHERE estado_resultante = 'completado';
CREATE INDEX IF NOT EXISTS idx_rmd_avances_cierre
  ON rmd_planes_avances(plan_id) WHERE estado_resultante = 'completado';

NOTIFY pgrst, 'reload schema';
