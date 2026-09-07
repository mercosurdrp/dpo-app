-- Análisis de ítems de checklist: 46 counts → 1 query (07/09/2026)
--
-- El denominador de cada ítem ("sobre cuántos checklists se evaluó") se sacaba
-- con un COUNT exacto por ítem: 46 ítems activos = 46 queries en paralelo sobre
-- checklist_respuestas (54.737 filas), cada una con inner join a
-- checklist_vehiculos para poder cortar por la fecha del checklist. Medido
-- contra Pampeana: un count solo 950 ms, los 46 juntos 3.498 ms — y como
-- /vehiculos/mantenimiento espera a que terminen TODAS sus queries antes de
-- renderizar, esos 3,5 s los pagaba la pantalla entera, no solo ese tab.
--
-- Dos cosas, y la primera sirve aunque nunca se llame a la función:
--
--   1. Índice por item_id. La tabla solo tenía idx_chk_resp_checklist, así que
--      filtrar por item_id era un scan completo. Es el motivo de fondo de que
--      cada count costara casi un segundo.
--   2. La función agrega todo en un solo group by. La app la usa vía RPC y, si
--      todavía no está aplicada, cae sola al método viejo (mismo criterio que
--      la cascada de PLAN_COLUMNAS en getChecklistsMtto): se puede deployar el
--      código antes o después de correr esto, en cualquier orden.
--
-- SECURITY INVOKER a propósito: las policies de checklist_respuestas y
-- checklist_vehiculos siguen aplicando igual que en la query que reemplaza.

CREATE INDEX IF NOT EXISTS idx_chk_resp_item ON checklist_respuestas(item_id);

CREATE OR REPLACE FUNCTION checklist_evaluado_por_item(
  p_desde DATE DEFAULT NULL,
  p_hasta DATE DEFAULT NULL
)
RETURNS TABLE (item_id UUID, evaluado BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  -- INNER JOIN, no LEFT: replica el `checklist_vehiculos!inner(fecha)` que
  -- usaba el count por ítem, donde una respuesta sin cabecera no cuenta.
  SELECT r.item_id, COUNT(*)::BIGINT AS evaluado
  FROM checklist_respuestas r
  JOIN checklist_vehiculos cv ON cv.id = r.checklist_id
  WHERE (p_desde IS NULL OR cv.fecha >= p_desde)
    AND (p_hasta IS NULL OR cv.fecha <= p_hasta)
  GROUP BY r.item_id;
$$;

GRANT EXECUTE ON FUNCTION checklist_evaluado_por_item(DATE, DATE) TO authenticated;
