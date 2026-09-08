-- =============================================================================
-- RMD sorteo: ventana horaria de recepcion declarada por el PDV
-- =============================================================================
-- El formulario del QR pide desde que hora hasta que hora puede recibir el
-- pedido (y una aclaracion libre, ej. "cerrado de 13 a 16"). Sirve para el
-- sorteo (saber cuando entregar el premio) y como insumo de ventanas horarias.

ALTER TABLE rmd_sorteo_inscripciones
  ADD COLUMN IF NOT EXISTS ventana_desde TIME,
  ADD COLUMN IF NOT EXISTS ventana_hasta TIME,
  ADD COLUMN IF NOT EXISTS ventana_obs   TEXT;

-- La vista suma las tres columnas al final (CREATE OR REPLACE solo permite
-- agregar columnas al final de la lista).
CREATE OR REPLACE VIEW v_rmd_sorteo_inscripciones AS
SELECT
  i.id,
  i.campania,
  i.nombre_pdv,
  i.cod_cliente,
  i.cod_cliente_resuelto,
  i.codigo_origen,
  i.nombre_sugerido,
  i.direccion,
  i.localidad,
  i.nombre_contacto,
  i.telefono,
  i.declara_califico,
  i.created_at,
  i.busqueda,
  coalesce(r.votos_desde, 0)   AS votos_desde,
  r.ultima_puntuacion,
  r.ultima_puntuacion_fecha,
  CASE
    WHEN coalesce(r.votos_desde, 0) > 0     THEN 'participa'
    WHEN i.cod_cliente_resuelto IS NOT NULL THEN 'todavia_no'
    ELSE 'sin_cruzar'
  END AS estado,
  i.ventana_desde,
  i.ventana_hasta,
  i.ventana_obs
FROM rmd_sorteo_inscripciones i
LEFT JOIN LATERAL (
  SELECT
    count(*)::int AS votos_desde,
    (array_agg(n.puntuacion ORDER BY n.fecha_puntuacion DESC))[1]       AS ultima_puntuacion,
    (array_agg(n.fecha_puntuacion ORDER BY n.fecha_puntuacion DESC))[1] AS ultima_puntuacion_fecha
  FROM nps_rmd_cliente n
  WHERE i.cod_cliente_resuelto IS NOT NULL
    AND n.cod_cliente = i.cod_cliente_resuelto
    AND n.fecha_puntuacion >= (i.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
) r ON true;

GRANT SELECT ON v_rmd_sorteo_inscripciones TO authenticated, service_role;
