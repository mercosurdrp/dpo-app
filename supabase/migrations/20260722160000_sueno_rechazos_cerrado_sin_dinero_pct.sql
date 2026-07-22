-- =============================================
-- Árbol del Sueño: `cerrado` y `sin_dinero` pasan de CANTIDAD a PORCENTAJE
-- =============================================
-- Los dos nodos medían un conteo ACUMULADO del año (371 y 738 al 2026-07-22) y
-- no tenían meta. Un acumulado creciente no se puede semaforizar: contra
-- cualquier meta fija arranca verde en enero y termina rojo sí o sí, y encima
-- no es comparable entre meses porque el volumen entregado se mueve fuerte
-- (6.330 pedidos en enero contra 5.295 en mayo).
--
-- Pasan a medir el % de pedidos del período que terminó en ese rechazo:
--
--     veces con el motivo ÷ pedidos del período × 100
--
-- Denominador = `ventas_diarias_cliente` contada como pares (id_cliente,fecha)
-- DISTINTOS. Dos detalles que justifican esa forma exacta:
--   1. La tabla NO es única por (id_cliente,fecha) — 41.534 filas contra 38.814
--      pares en 2026 — así que sin el `distinct` el denominador se infla ~7%.
--   2. Los pedidos rechazados YA están adentro (2.529 de los 2.531 rechazos de
--      2026 tienen su par en la tabla). Por eso NO se le suman los rechazos:
--      sería contarlos dos veces.
--
-- El numerador se cuenta en VECES (par cliente × fecha distinto), no en filas:
-- `rechazos` tiene una fila por artículo, así que un `count(*)` multiplica todo
-- por ~4 (1.573 filas contra 371 veces reales para 'cerrado'). Se respeta el
-- criterio que ya usaban `sueno_kpi_refresh` y `sueno_kpi_detalle` en la base.
--
-- OJO: los archivos 135_ y 136_ de este repo quedaron desactualizados respecto
-- de lo que corre en la base (todavía dicen `count(*)`). Esta migración
-- redefine ambas funciones COMPLETAS, así que reaplicar todo desde cero deja el
-- estado correcto igual — pero no hay que tomar 135_/136_ como referencia.
--
-- Metas: `cerrado` 0,5% (últimos 3 meses ~0,38%, viene de 1,79% en enero) y
-- `sin_dinero` 1,5% (últimos 3 meses ~1,42%, con un pico de 2,87% en abril).
-- `sin_dinero` va más laxo a propósito: depende del crédito y del cliente, no
-- de la operación, mientras que el local cerrado se ataca con horario de visita
-- y aviso previo.
-- =============================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refresh del YTD: ambos nodos pasan a %
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
BEGIN
  -- 'otif' e 'in_full' NO se tocan acá a proposito: su denominador son los HL
  -- solicitados por el PDV e incluye el VRC, que vive en la Railway del
  -- dashboard Mercosur y no es accesible desde este Postgres. Los calcula
  -- src/lib/sueno/otif.ts. Antes esta funcion les escribia el COMPLEMENTO
  -- (97,x) y como algun job la llama todos los dias a las 09:00 UTC, pisaba
  -- el valor bueno cada manana. Ver 20260721_sueno_refresh_no_pisa_otif.sql.
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

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'acto_inseguro' AND extract(year FROM fecha) = p_anio
  ), updated_at = now() WHERE kpi_key = 'comportamientos' AND anio = p_anio;

  -- Pedidos del año = pares (cliente, fecha) DISTINTOS. Ver cabecera: la tabla
  -- no es única por ese par y ya incluye los pedidos rechazados.
  SELECT count(distinct (id_cliente, fecha)) INTO v_ped
  FROM ventas_diarias_cliente
  WHERE extract(year FROM fecha) = p_anio;

  IF coalesce(v_ped, 0) > 0 THEN
    -- VECES = ocurrencias distintas de cliente x fecha (NO filas por articulo),
    -- sobre los pedidos del año. Da un % estable, no un acumulado creciente.
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

-- ---------------------------------------------------------------------------
-- 2. Detalle mensual: el modal muestra el % DE CADA MES, no la cantidad
-- ---------------------------------------------------------------------------
-- Se mantiene la cantidad de veces como columna `detalle` (antes iban los
-- bultos rechazados): con el valor en % hace falta ver el conteo crudo al lado
-- para dimensionar el mes, y los bultos no aplican a un local cerrado.
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

GRANT EXECUTE ON FUNCTION sueno_kpi_detalle(text, int) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Metas y recálculo del valor vigente
-- ---------------------------------------------------------------------------
UPDATE sueno_kpi_valores
   SET meta = 0.5, gatillo = 1.0, mejor_si = 'menor', updated_at = now()
 WHERE kpi_key = 'cerrado';

UPDATE sueno_kpi_valores
   SET meta = 1.5, gatillo = 2.5, mejor_si = 'menor', updated_at = now()
 WHERE kpi_key = 'sin_dinero';

-- Por si el año en curso todavía no tenía fila.
INSERT INTO sueno_kpi_valores (kpi_key, anio, meta, gatillo, mejor_si)
SELECT k.key, EXTRACT(YEAR FROM now())::int, k.meta, k.gatillo, 'menor'
  FROM (VALUES ('cerrado', 0.5, 1.0), ('sin_dinero', 1.5, 2.5)) AS k(key, meta, gatillo)
 WHERE NOT EXISTS (
   SELECT 1 FROM sueno_kpi_valores s
    WHERE s.kpi_key = k.key AND s.anio = EXTRACT(YEAR FROM now())::int
 );

-- Deja el valor vigente ya en % (si no, la card muestra 371 contra una meta de
-- 0,5 hasta que el job de las 09:00 UTC vuelva a correr).
SELECT sueno_kpi_refresh(EXTRACT(YEAR FROM now())::int);

COMMIT;
