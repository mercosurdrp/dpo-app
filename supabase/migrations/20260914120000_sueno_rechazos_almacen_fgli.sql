-- =============================================
-- Árbol del Sueño (2026-09-14, pedido del usuario):
--   1) Rama de rechazos: entran los dos motivos de ALMACÉN, «Sin stock»
--      (catalogo_rechazos 13) y «Fecha corta» (7), con la MISMA lógica que
--      «Cerrado» y «Sin dinero»: % de pedidos del período rechazados por ese
--      motivo (veces cliente×fecha ÷ pedidos), refresh diario, detalle mensual,
--      % sobre el total de rechazos, ranking de clientes, PDF y plan de acción.
--   2) Rama nueva FGLI (Full Goods Loss Index) debajo de VLC/HL, abierta en
--      WQI (almacén) y DQI (distribución). Los tres son KPI EXTERNOS: el valor
--      sale del depósito (deposito-esteban) y FGLI = WQI + DQI (mismo
--      denominador: HL entregados). Las filas de acá guardan META/GATILLO y
--      sirven de respaldo si el depósito no responde. WQI deja de colgar de
--      Prod Picking y pasa a colgar de FGLI (topología en arbol-config.ts).
--
-- El patrón ILIKE de cada motivo estaba repetido en 4 funciones (refresh,
-- detalle, pct, clientes). Se centraliza en `sueno_rechazo_patron(kpi)`: para
-- sumar un motivo nuevo alcanza con agregarlo ahí + una fila en
-- sueno_kpi_valores + el nodo en arbol-config.ts.
--
-- Metas (2026 a la fecha, sobre ~48.600 pedidos ene-sep):
--   sin_stock   YTD 0,15 % (ene 0,35 % → jun 0,04 %; sin casos desde julio)
--   fecha_corta YTD 0,13 % (jul 0,21 % · ago 0,16 % · sep 0,30 %, subiendo)
--   → meta 0,10 % y gatillo 0,20 % para los dos. Se editan con el lápiz.
--   dqi  meta 200 PPM (= meta del indicador DPO 1.4), gatillo 300.
--   fgli meta 2.400 PPM (= 2.200 WQI + 200 DQI), gatillo 3.100 (2.800 + 300).
-- =============================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Patrón de búsqueda por motivo (única fuente para las 4 funciones)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sueno_rechazo_patron(p_kpi text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $$
  SELECT CASE p_kpi
    WHEN 'sin_dinero'  THEN '%sin dinero%'
    WHEN 'cerrado'     THEN '%cerrad%'
    WHEN 'sin_stock'   THEN '%sin stock%'
    WHEN 'fecha_corta' THEN '%fecha corta%'
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION public.sueno_rechazo_patron(text) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 1. Filas de valores (meta / gatillo) para los 4 KPI nuevos
-- ---------------------------------------------------------------------------
INSERT INTO sueno_kpi_valores (kpi_key, anio, valor_ytd, meta, gatillo, mejor_si)
SELECT k.key, v.anio, NULL, k.meta, k.gatillo, 'menor'
FROM sueno_kpi_valores v
CROSS JOIN (VALUES
  ('sin_stock',   0.10::numeric, 0.20::numeric),
  ('fecha_corta', 0.10::numeric, 0.20::numeric)
) AS k(key, meta, gatillo)
WHERE v.kpi_key = 'cerrado'
ON CONFLICT (kpi_key, anio) DO NOTHING;

INSERT INTO sueno_kpi_valores (kpi_key, anio, valor_ytd, meta, gatillo, mejor_si)
SELECT k.key, v.anio, NULL, k.meta, k.gatillo, 'menor'
FROM sueno_kpi_valores v
CROSS JOIN (VALUES
  ('fgli', 2400::numeric, 3100::numeric),
  ('dqi',   200::numeric,  300::numeric)
) AS k(key, meta, gatillo)
WHERE v.kpi_key = 'wqi'
ON CONFLICT (kpi_key, anio) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Refresh del YTD: los 4 motivos de rechazo salen del mismo bloque
-- ---------------------------------------------------------------------------
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
  v_kpi  text;
BEGIN
  -- 'otif' e 'in_full' NO se tocan acá a propósito: su denominador incluye el
  -- VRC, que vive en la Railway del dashboard Mercosur. Los calcula
  -- src/lib/sueno/otif.ts. Ver 20260721_sueno_refresh_no_pisa_otif.sql.
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

  -- Pedidos del año = pares (cliente, fecha) DISTINTOS. La tabla no es única
  -- por ese par y ya incluye los pedidos rechazados (no se suman aparte).
  SELECT count(distinct (id_cliente, fecha)) INTO v_ped
  FROM ventas_diarias_cliente
  WHERE extract(year FROM fecha) = p_anio;

  IF coalesce(v_ped, 0) > 0 THEN
    -- Un motivo de rechazo = % de pedidos del año que terminó rechazado por
    -- ese motivo. VECES = cliente × fecha distintos (NO filas por artículo).
    -- Mismo bloque para los 4 motivos: el patrón sale de sueno_rechazo_patron.
    FOREACH v_kpi IN ARRAY ARRAY['sin_dinero', 'cerrado', 'sin_stock', 'fecha_corta'] LOOP
      UPDATE sueno_kpi_valores SET valor_ytd = (
        SELECT round(
          count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric
          / v_ped * 100, 2)
        FROM rechazos
        WHERE ds_rechazo ILIKE sueno_rechazo_patron(v_kpi)
          AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
      ), updated_at = now() WHERE kpi_key = v_kpi AND anio = p_anio;
    END LOOP;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Detalle mensual: cualquier motivo con patrón entra por la misma rama
-- ---------------------------------------------------------------------------
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

  -- Motivos de rechazo (sin_dinero / cerrado / sin_stock / fecha_corta):
  -- % de pedidos del mes rechazados por el motivo, con las veces al lado.
  ELSIF sueno_rechazo_patron(p_kpi) IS NOT NULL THEN
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
        AND ds_rechazo ILIKE sueno_rechazo_patron(p_kpi)
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

GRANT EXECUTE ON FUNCTION sueno_kpi_detalle(text, int) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 4. % del motivo sobre el total de rechazos, por mes (pestaña "% del total")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sueno_rechazo_pct(p_kpi text, p_anio int)
RETURNS TABLE(
  mes int,
  cant_tipo numeric,
  cant_total numeric,
  bultos_tipo numeric,
  bultos_total numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    extract(month FROM coalesce(fecha_venta, fecha))::int AS mes,
    count(*) FILTER (WHERE ds_rechazo ILIKE sueno_rechazo_patron(p_kpi))::numeric AS cant_tipo,
    count(*)::numeric AS cant_total,
    coalesce(sum(bultos_rechazados) FILTER (WHERE ds_rechazo ILIKE sueno_rechazo_patron(p_kpi)), 0) AS bultos_tipo,
    coalesce(sum(bultos_rechazados), 0) AS bultos_total
  FROM rechazos
  WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
  GROUP BY 1
  ORDER BY 1;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ranking de clientes del motivo (pestaña "Clientes" + PDF). p_mes NULL = año.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sueno_rechazo_clientes(p_kpi text, p_anio int, p_mes int DEFAULT NULL)
RETURNS TABLE(
  id_cliente int,
  nombre_cliente text,
  entregas numeric,
  bultos numeric,
  hl numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(r.id_cliente, -1) AS id_cliente,
    coalesce(max(r.nombre_cliente), 'Sin cliente') AS nombre_cliente,
    count(DISTINCT (r.serie, r.nrodoc))::numeric AS entregas,
    coalesce(sum(r.bultos_rechazados), 0) AS bultos,
    coalesce(sum(r.hl_rechazados), 0) AS hl
  FROM rechazos r
  WHERE r.ds_rechazo ILIKE sueno_rechazo_patron(p_kpi)
    AND extract(year FROM coalesce(r.fecha_venta, r.fecha)) = p_anio
    AND (p_mes IS NULL OR extract(month FROM coalesce(r.fecha_venta, r.fecha)) = p_mes)
  GROUP BY coalesce(r.id_cliente, -1)
  ORDER BY entregas DESC, bultos DESC;
$$;

GRANT EXECUTE ON FUNCTION sueno_rechazo_pct(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION sueno_rechazo_clientes(text, int, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Primer cálculo de los dos motivos nuevos (si no, la card queda en "—"
--    hasta el job de las 09:00 UTC)
-- ---------------------------------------------------------------------------
SELECT sueno_kpi_refresh(EXTRACT(YEAR FROM now())::int);

COMMIT;

-- Verificación sugerida:
-- SELECT kpi_key, valor_ytd, meta, gatillo FROM sueno_kpi_valores
--  WHERE anio = 2026 AND kpi_key IN ('sin_stock','fecha_corta','fgli','dqi','wqi');
-- SELECT * FROM sueno_kpi_detalle('fecha_corta', 2026);
