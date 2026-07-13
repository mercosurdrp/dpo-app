-- TRI y LTI del Árbol del Sueño: dejan de ser carga manual (venían en NULL, con
-- la card vacía) y pasan a salir de `reportes_seguridad`, que ya guarda cada
-- accidente clasificado en `tipo_accidente` (FAT/LTI/MDI/MTI/FAI/SIO/SHO).
--
--   TRI = registrables = FAT + LTI + MDI + MTI  (el FAI, primeros auxilios, NO
--         es registrable; SIO/SHO son observaciones, no accidentes)
--   LTI = accidentes con días perdidos
--
-- Solo se cuentan los reportes de tipo 'accidente': el mismo `tipo_accidente`
-- aparece en incidentes y actos inseguros (cargados como SIO/SHO), que ya se
-- cuentan en n_incidentes y comportamientos.
CREATE OR REPLACE FUNCTION sueno_kpi_refresh(p_anio int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rech numeric;
  v_ent  numeric;
  v_otif numeric;
  v_rpct numeric;
BEGIN
  SELECT coalesce(sum(bultos_rechazados), 0) INTO v_rech
  FROM rechazos WHERE extract(year FROM coalesce(fecha_venta, fecha)) = p_anio;
  SELECT coalesce(sum(total_bultos), 0) INTO v_ent
  FROM ventas_diarias WHERE extract(year FROM fecha) = p_anio;

  IF v_ent > 0 THEN
    v_rpct := round(v_rech / v_ent * 100, 2);
    v_otif := round((1 - v_rech / v_ent) * 100, 2);
    UPDATE sueno_kpi_valores SET valor_ytd = v_otif, updated_at = now()
      WHERE kpi_key = 'otif' AND anio = p_anio;
    UPDATE sueno_kpi_valores SET valor_ytd = v_rpct, updated_at = now()
      WHERE kpi_key = 'rechazo' AND anio = p_anio;
    UPDATE sueno_kpi_valores SET valor_ytd = v_otif, updated_at = now()
      WHERE kpi_key = 'in_full' AND anio = p_anio;
  END IF;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM reportes_seguridad
    WHERE tipo = 'accidente'
      AND tipo_accidente IN ('fat', 'lti', 'mdi', 'mti')
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

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM rechazos
    WHERE ds_rechazo ILIKE '%sin dinero%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() WHERE kpi_key = 'sin_dinero' AND anio = p_anio;

  UPDATE sueno_kpi_valores SET valor_ytd = (
    SELECT count(*) FROM rechazos
    WHERE ds_rechazo ILIKE '%cerrad%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
  ), updated_at = now() WHERE kpi_key = 'cerrado' AND anio = p_anio;
END;
$$;

GRANT EXECUTE ON FUNCTION sueno_kpi_refresh(int) TO authenticated, service_role;

-- Detalle mensual de TRI y LTI para el modal del árbol (antes, al ser manuales,
-- el modal no tenía nada que mostrar). `detalle` = accidentes cargados en el mes,
-- para poder leer el TRI contra el total (p. ej. un FAI que no es registrable).
CREATE OR REPLACE FUNCTION sueno_kpi_detalle(p_kpi text, p_anio int)
RETURNS TABLE(mes int, valor numeric, detalle numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kpi IN ('otif', 'rechazo', 'in_full') THEN
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
      CASE WHEN p_kpi = 'rechazo'
           THEN round(coalesce(r.br, 0) / nullif(v.be, 0) * 100, 2)
           ELSE round((1 - coalesce(r.br, 0) / nullif(v.be, 0)) * 100, 2)
      END,
      round(coalesce(r.br, 0), 0)
    FROM v LEFT JOIN r ON r.m = v.m
    ORDER BY v.m;

  ELSIF p_kpi = 'tri' THEN
    RETURN QUERY
    SELECT extract(month FROM fecha)::int,
           count(*) FILTER (WHERE tipo_accidente IN ('fat', 'lti', 'mdi', 'mti'))::numeric,
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
    RETURN QUERY
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int,
           count(*)::numeric, round(sum(bultos_rechazados), 0)
    FROM rechazos
    WHERE ds_rechazo ILIKE '%sin dinero%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSIF p_kpi = 'cerrado' THEN
    RETURN QUERY
    SELECT extract(month FROM coalesce(fecha_venta, fecha))::int,
           count(*)::numeric, round(sum(bultos_rechazados), 0)
    FROM rechazos
    WHERE ds_rechazo ILIKE '%cerrad%'
      AND extract(year FROM coalesce(fecha_venta, fecha)) = p_anio
    GROUP BY 1 ORDER BY 1;

  ELSE
    RETURN; -- manual: sin detalle automático
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sueno_kpi_detalle(text, int) TO authenticated, anon, service_role;
