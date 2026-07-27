-- =============================================
-- Comportamientos inseguros ABIERTOS POR ÁREA (Árbol del Sueño)
-- Mejora pedida por la auditoría (2026-07-27): el nivel operativo gestiona por
-- sector, así que el PI único `comportamientos` se parte en dos nodos:
--   comportamientos_almacen  -> reportes con area = 'deposito'
--   comportamientos_flota    -> reportes con area = 'distribucion'
-- La key vieja `comportamientos` NO se borra: la RPC la sigue actualizando para
-- no perder la serie histórica del total, pero ya no cuelga del árbol (topología
-- en src/lib/sueno/arbol-config.ts).
--
-- Además: el área pasa a ser obligatoria al cargar un reporte. La validación
-- fuerte va en la app (server action `createReporte`); acá el NOT NULL se aplica
-- SOLO si la base no tiene filas viejas sin área (en Pampeana los 33 reportes ya
-- la tienen; la base de Misiones tiene 3 sin área y ahí el ALTER se saltea).
-- =============================================

-- ---------------------------------------------
-- 1) Filas de valores para los dos KPI nuevos
--    (se siembran para todos los años que ya tenían el KPI total)
-- ---------------------------------------------
INSERT INTO sueno_kpi_valores (kpi_key, anio, valor_ytd, meta, gatillo, mejor_si)
SELECT k.key, v.anio, NULL, k.meta, NULL, 'mayor'
FROM sueno_kpi_valores v
CROSS JOIN (VALUES
  ('comportamientos_almacen', 50::numeric),
  ('comportamientos_flota',   50::numeric)
) AS k(key, meta)
WHERE v.kpi_key = 'comportamientos'
ON CONFLICT (kpi_key, anio) DO NOTHING;

-- ---------------------------------------------
-- 2) Refresh automático del YTD
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.sueno_kpi_refresh(p_anio integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rech numeric;
  v_ent  numeric;
  v_rpct numeric;
  v_vlc  numeric;
  v_ped  numeric;
BEGIN
  SELECT coalesce(sum(bultos_rechazados), 0) INTO v_rech
  FROM rechazos WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio;
  SELECT coalesce(sum(total_bultos), 0) INTO v_ent
  FROM ventas_diarias WHERE extract(year FROM fecha) = p_anio;

  IF v_ent > 0 THEN
    v_rpct := round(v_rech / v_ent * 100, 2);
    UPDATE sueno_kpi_valores SET valor_ytd = v_rpct, updated_at = now()
      WHERE kpi_key = 'rechazo' AND anio = p_anio;
  END IF;

  SELECT round(sum(c.distribucion + c.almacen) / nullif(sum(h.hl), 0), 0)
    INTO v_vlc
  FROM costo_logistico_mensual c
  JOIN (
    SELECT t.m, sum(t.hl) AS hl
    FROM (
      SELECT extract(month FROM fecha)::int AS m, total_hl AS hl
      FROM ventas_diarias
      WHERE origen = 'chess' AND extract(year FROM fecha) = p_anio
      UNION ALL
      SELECT extract(month FROM fecha)::int,
             CASE WHEN ds_documento IN ('DVVTA', 'PRDVO') THEN -total_hl ELSE total_hl END
      FROM ventas_mostrador_diarias
      WHERE extract(year FROM fecha) = p_anio
    ) t
    GROUP BY t.m
  ) h ON h.m = c.mes
  WHERE c.anio = p_anio;

  IF v_vlc IS NOT NULL THEN
    UPDATE sueno_kpi_valores SET valor_ytd = v_vlc, updated_at = now()
      WHERE kpi_key = 'vlc_hl' AND anio = p_anio;
  END IF;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'accidente'
      AND tipo_accidente IN ('lti', 'mdi', 'mti')
      AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'tri' AND anio = p_anio;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'accidente'
      AND tipo_accidente = 'lti'
      AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'lti' AND anio = p_anio;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'incidente' AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'n_incidentes' AND anio = p_anio;

  -- Total (fuera del árbol desde 07-2026, se mantiene por histórico)
  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'comportamientos' AND anio = p_anio;

  -- Apertura por área: almacén (depósito) y flota (distribución)
  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND area = 'deposito'
      AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'comportamientos_almacen' AND anio = p_anio;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND area = 'distribucion'
      AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'comportamientos_flota' AND anio = p_anio;

  SELECT count(distinct (id_cliente, fecha)) INTO v_ped
  FROM ventas_diarias_cliente
  WHERE extract(year FROM fecha) = p_anio;

  IF coalesce(v_ped, 0) > 0 THEN
    UPDATE sueno_kpi_valores SET valor_ytd = (
      SELECT round(
        count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric
        / v_ped * 100, 2)
      FROM rechazos
      WHERE ds_rechazo ILIKE '%sin dinero%'
        AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    ), updated_at = now() WHERE kpi_key = 'sin_dinero' AND anio = p_anio;

    UPDATE sueno_kpi_valores SET valor_ytd = (
      SELECT round(
        count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric
        / v_ped * 100, 2)
      FROM rechazos
      WHERE ds_rechazo ILIKE '%cerrad%'
        AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    ), updated_at = now() WHERE kpi_key = 'cerrado' AND anio = p_anio;
  END IF;
END;
$function$;

-- ---------------------------------------------
-- 3) Detalle mensual (modal que explica el número)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.sueno_kpi_detalle(p_kpi text, p_anio integer)
 RETURNS TABLE(mes integer, valor numeric, detalle numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_kpi = 'rechazo' THEN
    RETURN QUERY
    WITH r AS (
      SELECT extract(month FROM coalesce(fecha_venta, fecha))::int AS m,
             sum(bultos_rechazados) AS br
      FROM rechazos
      WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
      GROUP BY 1
    ), v AS (
      SELECT extract(month FROM fecha)::int AS m, sum(total_bultos) AS be
      FROM ventas_diarias
      WHERE extract(year FROM fecha) = p_anio
      GROUP BY 1
    )
    SELECT v.m,
           round(coalesce(r.br, 0) / nullif(v.be, 0) * 100, 2),
           round(coalesce(r.br, 0), 0)
    FROM v LEFT JOIN r ON r.m = v.m
    ORDER BY v.m;

  ELSIF p_kpi = 'vlc_hl' THEN
    RETURN QUERY
    WITH hl AS (
      SELECT t.m, sum(t.hl) AS hl
      FROM (
        SELECT extract(month FROM fecha)::int AS m, total_hl AS hl
        FROM ventas_diarias
        WHERE origen = 'chess' AND extract(year FROM fecha) = p_anio
        UNION ALL
        SELECT extract(month FROM fecha)::int,
               CASE WHEN ds_documento IN ('DVVTA', 'PRDVO') THEN -total_hl ELSE total_hl END
        FROM ventas_mostrador_diarias
        WHERE extract(year FROM fecha) = p_anio
      ) t
      GROUP BY t.m
    )
    SELECT c.mes,
           round((c.distribucion + c.almacen) / nullif(h.hl, 0), 0),
           round(h.hl::numeric, 0)
    FROM costo_logistico_mensual c
    JOIN hl h ON h.m = c.mes
    WHERE c.anio = p_anio
    ORDER BY c.mes;

  ELSIF p_kpi = 'tri' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int,
           count(*) FILTER (WHERE tipo_accidente IN ('lti', 'mdi', 'mti'))::numeric,
           count(*)::numeric
    FROM reportes_seguridad
    WHERE tipo = 'accidente' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'lti' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int,
           count(*) FILTER (WHERE tipo_accidente = 'lti')::numeric,
           count(*)::numeric
    FROM reportes_seguridad
    WHERE tipo = 'accidente' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'n_incidentes' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int, count(*)::numeric, NULL::numeric
    FROM reportes_seguridad
    WHERE tipo = 'incidente' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'comportamientos' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int, count(*)::numeric, NULL::numeric
    FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  -- Apertura por área. La 2ª columna ("detalle") muestra el TOTAL de actos
  -- inseguros del mes, para leer el peso del área contra el total.
  ELSIF p_kpi IN ('comportamientos_almacen', 'comportamientos_flota') THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int,
           count(*) FILTER (
             WHERE area = CASE WHEN p_kpi = 'comportamientos_almacen'
                               THEN 'deposito'::reporte_seguridad_area
                               ELSE 'distribucion'::reporte_seguridad_area END
           )::numeric,
           count(*)::numeric
    FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND extract(year FROM fecha) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi IN ('sin_dinero', 'cerrado') THEN
    RETURN QUERY
    WITH p AS (
      SELECT extract(month FROM fecha)::int AS m,
             count(distinct (id_cliente, fecha)) AS pedidos
      FROM ventas_diarias_cliente
      WHERE extract(year FROM fecha) = p_anio
      GROUP BY 1
    ), r AS (
      SELECT extract(month FROM coalesce(fecha_venta, fecha))::int AS m,
             count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric AS veces
      FROM rechazos
      WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
        AND ((p_kpi = 'sin_dinero' AND ds_rechazo ILIKE '%sin dinero%')
          OR (p_kpi = 'cerrado'    AND ds_rechazo ILIKE '%cerrad%'))
      GROUP BY 1
    )
    SELECT p.m,
           round(coalesce(r.veces, 0) / nullif(p.pedidos, 0) * 100, 2),
           coalesce(r.veces, 0)
    FROM p LEFT JOIN r ON r.m = p.m
    ORDER BY p.m;

  ELSE
    RETURN;
  END IF;
END;
$function$;

-- ---------------------------------------------
-- 4) Área obligatoria (solo si la base no tiene reportes viejos sin área)
-- ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reportes_seguridad WHERE area IS NULL) THEN
    ALTER TABLE reportes_seguridad ALTER COLUMN area SET NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------
-- 5) Primer cálculo de los dos KPI nuevos
-- ---------------------------------------------
SELECT sueno_kpi_refresh(extract(year FROM current_date)::int);
