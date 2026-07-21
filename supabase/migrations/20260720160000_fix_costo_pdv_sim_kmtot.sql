-- =====================================================================
-- FIX: get_costo_por_pdv_sim usaba OTRO divisor de km que get_costo_por_pdv
--
-- El $/km del modelo = distribucion / km_totales_del_mes. La función REAL
-- resuelve esos km como coalesce(costo_logistico_mensual.km_totales,
-- suma de registro_combustible); la de SIMULACIÓN miraba únicamente
-- registro_combustible. Como km_totales está cargado ene–abr 2026 y
-- registro_combustible arranca en abril (y abril viene incompleto: 9.053 km
-- contra 32.473 cargados), la simulación quedaba incomparable con el real:
--
--   ene–mar : divisor NULL      -> costo de llegar = 0
--   abril   : divisor 9.053     -> $/km 3,6x inflado, costo de llegar
--                                  242 M contra una distribución de 105 M
--   may–jun : ambos coinciden   -> único período que daba bien
--
-- O sea que la solapa Simulación de Costo por PDV venía mostrando basura
-- para los primeros cuatro meses del año. Con esto los dos escenarios se
-- calculan con el MISMO $/km y la comparación pasa a tener sentido: el
-- escenario "CD en San Nicolás" da 10,4%–14,0% menos costo de llegar todos
-- los meses, en vez de saltar entre 0 y −217%.
--
-- Se reescribe la función a partir de su propia definición VIVA: las
-- get_costo_por_pdv* de producción están divergidas del repo (tienen
-- costo_distancia y rechazos sin versionar), así que tomar la definición
-- de una migración vieja pisaría cambios que no están acá.
-- =====================================================================
DO $mig$
DECLARE
  d text;
  d0 text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_costo_por_pdv_sim'
  LIMIT 1;
  d0 := d;

  -- 1) el CTE `costo` tiene que exponer km_totales para poder priorizarlo
  d := replace(
    d,
    'select distribucion, almacen from costo_logistico_mensual where anio=p_anio and mes=p_mes',
    'select distribucion, almacen, km_totales from costo_logistico_mensual where anio=p_anio and mes=p_mes'
  );

  -- 2) mismo divisor de km que get_costo_por_pdv
  d := replace(
    d,
    'select nullif(sum(km_recorridos),0)::numeric kmt
    from registro_combustible
    where fecha >= make_date(p_anio,p_mes,1) and fecha < (make_date(p_anio,p_mes,1)+interval ''1 month'')',
    'select nullif(coalesce(
      (select km_totales from costo),
      (select sum(km_recorridos) from registro_combustible
        where fecha >= make_date(p_anio,p_mes,1) and fecha < (make_date(p_anio,p_mes,1)+interval ''1 month''))
    ),0)::numeric kmt'
  );

  -- Idempotente: si ya está parcheada, los replace no encuentran nada y no
  -- hay que hacer ruido. Sólo falla si la definición viva cambió de forma.
  IF d = d0 THEN
    IF position('(select km_totales from costo)' in d0) > 0 THEN
      RAISE NOTICE 'get_costo_por_pdv_sim ya estaba parcheada, no se toca.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'No se pudo parchear get_costo_por_pdv_sim: la definición viva no coincide con lo esperado. Revisar a mano.';
  END IF;

  EXECUTE d;
END $mig$;
