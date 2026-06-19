-- Recalcula los KPIs del Árbol del Sueño que tienen fuente en la app (YTD).
-- Actualiza solo valor_ytd (meta / mejor_si / gatillo quedan como los dejó el admin).
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
