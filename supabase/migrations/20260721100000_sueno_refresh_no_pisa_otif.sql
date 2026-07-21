-- `sueno_kpi_refresh` deja de escribir 'otif' e 'in_full' (2026-07-21).
--
-- Ayer se implementó el OTIF/In-Full con la definición del negocio (ver
-- 20260720140000_sueno_otif_infull.sql): % de pérdida en HL sobre los HL
-- solicitados por el PDV. Esa cuenta NO puede hacerse en SQL porque el VRC vive
-- en la Railway del dashboard Mercosur, así que la hace `src/lib/sueno/otif.ts`.
--
-- 🚨 El error: se dejó `sueno_kpi_refresh` intacta — todavía escribiendo el
-- COMPLEMENTO (97,x) en esas dos filas — confiando en que el server action la
-- llama primero y después las pisa con el valor bueno. Pero algo dispara la RPC
-- DIRECTAMENTE todos los días a las 09:00 UTC, sin pasar por el server action:
-- a la mañana siguiente el árbol volvía a mostrar 97,56 contra meta 1,4.
-- (No es pg_cron: la extensión no está instalada en este proyecto.)
--
-- El arreglo va en la raíz: mientras la función pueda escribir esas filas,
-- cualquier llamador la puede desincronizar. Ahora no las toca nadie más que el
-- código que sabe calcularlas.
--
-- Se conserva TODO el resto de la función sin cambios — incluido el bloque del
-- VLC/HL, que ya se perdió una vez por un CREATE OR REPLACE descuidado (ver
-- 20260715150000_sueno_vlc_hl_restore). El nodo `rechazo` sigue exactamente
-- igual: todos los motivos en bultos ÷ lo distribuido.
--
-- Complemento del arreglo (en TS): `getSuenoArbol` ahora resuelve OTIF e In-Full
-- EN VIVO con `otifResumen()`, igual que TLP y Tiempo en PDV, así el árbol no
-- depende de que alguien corra el refresh ni de lo que quedó persistido.

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
BEGIN
  -- 'otif' e 'in_full' NO se tocan acá a proposito: los calcula
  -- src/lib/sueno/otif.ts (su denominador incluye el VRC, que esta en Railway).
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

  -- VECES = ocurrencias distintas de cliente x fecha (NO filas por articulo).
  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))
    FROM rechazos
    WHERE ds_rechazo ILIKE '%sin dinero%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() WHERE kpi_key = 'sin_dinero' AND anio = p_anio;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))
    FROM rechazos
    WHERE ds_rechazo ILIKE '%cerrad%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() WHERE kpi_key = 'cerrado' AND anio = p_anio;
END;
$function$;
