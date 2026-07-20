-- OTIF / In-Full con la definición del negocio (2026-07-20).
--
--   In Full = (rechazos + stock out + cancelaciones) ÷ HL VENDIDOS
--   OTIF    = In Full + VRL + VRC          (el On Time)
--
-- Los dos se expresan como % de PÉRDIDA (cuanto más bajo, mejor). NO se hace
-- "100 − resultado": el número que se publica es directamente la pérdida.
-- Antes 'otif' e 'in_full' guardaban el COMPLEMENTO (98,x) mientras el árbol
-- ya los tenía configurados como `mejor_si = menor` con meta 1,7 ⇒ el nodo
-- daba rojo permanente. Esta migración alinea el dato con esa configuración.
--
-- 🚨 DENOMINADOR: "HL vendidos" = FACTURADO CHESS NETO, la fila "HL vendidos"
-- del Cuadro de Indicadores — NO `ventas_diarias` a secas, que es lo
-- DISTRIBUIDO y deja afuera la venta mostrador (~40% del volumen). Fórmula:
--   distribuido chess (ventas_diarias origen='chess')
--   + FCVTA (mostrador) + PRVTA (factura presupuesto)
--   − DVVTA (notas de crédito) − PRDVO (devoluciones presupuesto)
-- Validado contra la serie oficial 2026 del usuario (ene→jun):
--   1,81 · 1,81 · 1,76 · 3,71 · 1,18 · 0,90  vs  calculado
--   1,83 · 1,83 · 1,78 · 3,84 · 1,17 · 0,91  ⇒ cierra salvo abril, que en la
--   serie vieja venía subcontado por el tope de 1000 filas de PostgREST.
-- El origen de esta fórmula es `src/actions/cuadro-mensual.ts` (facturado_chess_*);
-- si allá cambia, hay que replicarlo acá.
--
-- 🚨 El nodo `rechazo` NO se toca: sigue midiendo TODOS los motivos sobre lo
-- DISTRIBUIDO, igual que el indicador de rechazos que ya se usa. Por eso
-- `rechazo` e `in_full` NO son comparables entre sí ni suman en cascada:
-- tienen denominadores distintos a propósito (operativo vs comercial).
--
-- Notas de alcance:
--   · "stock out" es el motivo de rechazo SIN STOCK, que ya vive dentro de
--     `rechazos`; en `in_full` entra sumado junto al resto. Es marginal:
--     0,003%–0,030% del volumen según el mes.
--   · "cancelaciones" todavía no tiene fuente en la app (no hay tabla de
--     pedidos anulados) ⇒ hoy suma 0. Cuando exista, se agrega acá.
--   · El OTIF NO se calcula en SQL: el VRC vive en la Railway del dashboard
--     Mercosur, fuera de este Postgres. Lo arma `src/lib/sueno/otif.ts`
--     combinando esta función con esa base.
--   · `sueno_kpi_refresh` NO se reescribe acá a propósito: esa función es larga
--     y ya hubo un incidente (ver 20260715150000_sueno_vlc_hl_restore) donde un
--     CREATE OR REPLACE se comió el bloque del VLC/HL y lo dejó congelado. En su
--     lugar, el server action la llama primero y DESPUÉS pisa las tres filas de
--     la rama cliente con `sueno_kpi_refresh_cliente` + el OTIF calculado en TS.
--     El orden importa: el refresh viejo todavía escribe el complemento (98,x).

-- ── Componentes mensuales, todo en HL y agregado en el server ──
-- (agregar acá y no en el cliente evita el tope de 1000 filas de PostgREST,
--  que ya subcontó los rechazos de ene-abr 2026)
CREATE OR REPLACE FUNCTION sueno_otif_componentes(p_anio int)
RETURNS TABLE(
  mes int,
  hl_vendidos numeric,
  hl_rechazo numeric,
  hl_stockout numeric,
  hl_vrl numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (
    -- Facturado Chess NETO = misma fórmula que la fila "vendidos" del Cuadro
    -- de Indicadores. Ojo: NO es `sum(total_hl)` de ventas_diarias.
    SELECT d.m,
           d.chess + coalesce(mo.fcvta, 0) + coalesce(mo.prvta, 0)
                   - coalesce(mo.dvvta, 0) - coalesce(mo.prdvo, 0) AS vendidos
    FROM (
      SELECT extract(month FROM fecha)::int AS m, sum(total_hl) AS chess
      FROM ventas_diarias
      WHERE origen = 'chess' AND extract(year FROM fecha) = p_anio
      GROUP BY 1
    ) d
    LEFT JOIN (
      SELECT extract(month FROM fecha)::int AS m,
             coalesce(sum(total_hl) FILTER (WHERE ds_documento = 'FCVTA'), 0) AS fcvta,
             coalesce(sum(total_hl) FILTER (WHERE ds_documento = 'PRVTA'), 0) AS prvta,
             coalesce(sum(total_hl) FILTER (WHERE ds_documento = 'DVVTA'), 0) AS dvvta,
             coalesce(sum(total_hl) FILTER (WHERE ds_documento = 'PRDVO'), 0) AS prdvo
      FROM ventas_mostrador_diarias
      WHERE extract(year FROM fecha) = p_anio
      GROUP BY 1
    ) mo ON mo.m = d.m
  ), r AS (
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int AS m,
           coalesce(sum(hl_rechazados) FILTER (WHERE ds_rechazo IS DISTINCT FROM 'SIN STOCK'), 0) AS rech,
           coalesce(sum(hl_rechazados) FILTER (WHERE ds_rechazo = 'SIN STOCK'), 0) AS stockout
    FROM rechazos
    WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1
  ), l AS (
    SELECT (split_part(anio_mes, '-', 2))::int AS m, sum(hl) AS vrl
    FROM v_vrl_mensual
    WHERE split_part(anio_mes, '-', 1) = p_anio::text
    GROUP BY 1
  )
  SELECT v.m,
         coalesce(v.vendidos, 0),
         coalesce(r.rech, 0),
         coalesce(r.stockout, 0),
         coalesce(l.vrl, 0)
  FROM v
  LEFT JOIN r ON r.m = v.m
  LEFT JOIN l ON l.m = v.m
  ORDER BY v.m;
$$;

GRANT EXECUTE ON FUNCTION sueno_otif_componentes(int) TO authenticated, anon, service_role;

-- ── Detalle mensual ──
-- Solo cambia la rama de rechazo/in_full (ahora % de pérdida, y separando el
-- stock out). 'otif' YA NO sale de acá: lo resuelve el server action porque
-- necesita el VRC de la Railway. El resto de las ramas queda igual.
CREATE OR REPLACE FUNCTION sueno_kpi_detalle(p_kpi text, p_anio int)
RETURNS TABLE(mes int, valor numeric, detalle numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kpi = 'in_full' THEN
    -- Denominador = facturado neto (ver cabecera). Distinto del de 'rechazo'.
    RETURN QUERY
    SELECT c.mes,
           round((c.hl_rechazo + c.hl_stockout)
                 / nullif(c.hl_vendidos, 0) * 100, 2),
           round(c.hl_rechazo + c.hl_stockout, 0)
    FROM sueno_otif_componentes(p_anio) c
    ORDER BY c.mes;

  ELSIF p_kpi = 'rechazo' THEN
    -- SIN CAMBIOS (pedido explícito): todos los motivos ÷ lo DISTRIBUIDO,
    -- igual que el indicador de rechazos del cuadro.
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

  ELSIF p_kpi = 'sin_dinero' THEN
    -- valor = VECES (cliente x fecha distintos); detalle = bultos rechazados
    RETURN QUERY
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int,
           count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric,
           round(sum(bultos_rechazados), 0)
    FROM rechazos
    WHERE ds_rechazo ILIKE '%sin dinero%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'cerrado' THEN
    -- valor = VECES (cliente x fecha distintos); detalle = bultos rechazados
    RETURN QUERY
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int,
           count(distinct (coalesce(id_cliente::text, '?'), coalesce(fecha_venta, fecha)))::numeric,
           round(sum(bultos_rechazados), 0)
    FROM rechazos
    WHERE ds_rechazo ILIKE '%cerrad%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSE
    RETURN; -- manual: sin detalle automatico
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sueno_kpi_detalle(text, int) TO authenticated, anon, service_role;

-- ── Refresh YTD: in_full y rechazo en % de pérdida; 'otif' ya no se toca ──
CREATE OR REPLACE FUNCTION sueno_kpi_refresh_cliente(p_anio int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vend     numeric;
  v_rech     numeric;
  v_stockout numeric;
BEGIN
  SELECT sum(hl_vendidos), sum(hl_rechazo), sum(hl_stockout)
    INTO v_vend, v_rech, v_stockout
  FROM sueno_otif_componentes(p_anio);

  -- Solo in_full. 'rechazo' lo sigue escribiendo `sueno_kpi_refresh` con su
  -- denominador de siempre (distribuido), sin tocar.
  IF coalesce(v_vend, 0) > 0 THEN
    UPDATE sueno_kpi_valores
       SET valor_ytd = round((v_rech + v_stockout) / v_vend * 100, 2), updated_at = now()
     WHERE kpi_key = 'in_full' AND anio = p_anio;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sueno_kpi_refresh_cliente(int) TO authenticated, anon, service_role;
