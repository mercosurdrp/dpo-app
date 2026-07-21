-- Costo por PDV: el almacén se reparte entre TODOS los bultos que pasaron por el
-- depósito (vendidos), no sólo entre los distribuidos.
--
-- Motivo: los HL vendidos (los del Árbol del Sueño) son mayores que los distribuidos.
-- La diferencia — "la bolsa" — es venta que se retira en el depósito: consume almacén
-- pero NO consume camión. Hasta ahora los PDV con reparto absorbían también el costo
-- de almacenar esa bolsa, lo que inflaba su costo ~6-8%.
--
--   costo_almacen  = almacén × bultos_pdv / bultos_VENDIDOS   <- único cambio
--   costo_distrib  = sin cambios (sólo entre los distribuidos)
--   costo_distancia= sin cambios
--
-- Las funciones get_costo_por_pdv* de prod están DIVERGIDAS del repo (tienen
-- costo_distancia/rechazos/viajes que nunca se versionaron). Por eso esto NO reescribe
-- la función: lee la definición VIVA con pg_get_functiondef y le aplica un replace
-- acotado. Es idempotente — si el patrón ya no está, no hace nada y avisa.

DO $mig$
DECLARE
  f          text;
  def        text;
  nueva      text;
  patron_tot text := 'tot as (select sum(bultos) b_tot from base_geo),';
  patron_alm text := '(select almacen from costo) * bg.bultos / nullif((select b_tot from tot),0)';
  cte_bvend  text;
BEGIN
  -- bultos facturados del mes = Chess distribuido + mostrador/segunda vuelta,
  -- restando devoluciones. Es el mismo universo que el "HL vendidos" que usa
  -- sueno_kpi_detalle('vlc_hl'), de modo que ambos indicadores cierran entre sí.
  --
  -- greatest(...) es una red de seguridad: si ventas_mostrador_diarias no está
  -- cargada para el mes, b_vend quedaría por debajo de los bultos distribuidos y el
  -- almacén se repartiría de más. En ese caso cae al comportamiento anterior.
  cte_bvend := $q$
  bvend as (
    select greatest(
      coalesce((
        select sum(t.b) from (
          select total_bultos b from ventas_diarias
           where origen = 'chess'
             and fecha >= make_date(p_anio,p_mes,1)
             and fecha <  (make_date(p_anio,p_mes,1)+interval '1 month')
          union all
          select case when ds_documento in ('DVVTA','PRDVO') then -total_bultos
                      else total_bultos end
            from ventas_mostrador_diarias
           where fecha >= make_date(p_anio,p_mes,1)
             and fecha <  (make_date(p_anio,p_mes,1)+interval '1 month')
        ) t
      ),0),
      coalesce((select b_tot from tot),0)
    )::numeric as b_vend
  ),$q$;

  FOREACH f IN ARRAY ARRAY['get_costo_por_pdv','get_costo_por_pdv_sim'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f;

    IF def IS NULL THEN
      RAISE EXCEPTION 'No existe la función %', f;
    END IF;

    IF position('bvend' in def) > 0 THEN
      RAISE NOTICE '% ya tiene el reparto por bultos vendidos, se omite', f;
      CONTINUE;
    END IF;

    IF position(patron_tot in def) = 0 OR position(patron_alm in def) = 0 THEN
      RAISE EXCEPTION 'La definición viva de % no tiene el patrón esperado. '
        'Revisar a mano con pg_get_functiondef antes de reintentar.', f;
    END IF;

    nueva := replace(def, patron_tot, patron_tot || cte_bvend);
    nueva := replace(nueva, patron_alm,
      '(select almacen from costo) * bg.bultos / nullif((select b_vend from bvend),0)');

    EXECUTE nueva;
    RAISE NOTICE '% actualizada', f;
  END LOOP;
END
$mig$;

-- La bolsa, para poder mostrarla en la UI como una línea más y que el total cierre.
CREATE OR REPLACE FUNCTION public.get_bolsa_deposito(p_anio integer, p_mes integer)
RETURNS TABLE(bultos numeric, hl numeric, costo_almacen numeric, costo_x_hl numeric)
LANGUAGE sql
STABLE
AS $function$
  with vend as (
    select sum(t.b) b, sum(t.hl) hl from (
      select total_bultos b, total_hl hl from ventas_diarias
       where origen = 'chess'
         and fecha >= make_date(p_anio,p_mes,1)
         and fecha <  (make_date(p_anio,p_mes,1)+interval '1 month')
      union all
      select case when ds_documento in ('DVVTA','PRDVO') then -total_bultos else total_bultos end,
             case when ds_documento in ('DVVTA','PRDVO') then -total_hl     else total_hl     end
        from ventas_mostrador_diarias
       where fecha >= make_date(p_anio,p_mes,1)
         and fecha <  (make_date(p_anio,p_mes,1)+interval '1 month')
    ) t
  ),
  dist as (
    select sum(bultos) b, sum(hl) hl from ventas_diarias_cliente
     where fecha >= make_date(p_anio,p_mes,1)
       and fecha <  (make_date(p_anio,p_mes,1)+interval '1 month')
       and origen in ('chess','gestion')
  ),
  costo as (select almacen from costo_logistico_mensual where anio=p_anio and mes=p_mes)
  select round(greatest(v.b - d.b, 0),1),
         round(greatest(v.hl - d.hl, 0),1),
         round((select almacen from costo) * greatest(v.b - d.b,0) / nullif(v.b,0), 2),
         round(((select almacen from costo) * greatest(v.b - d.b,0) / nullif(v.b,0))
               / nullif(greatest(v.hl - d.hl,0),0), 2)
  from vend v cross join dist d;
$function$;

GRANT EXECUTE ON FUNCTION public.get_bolsa_deposito(integer,integer) TO anon, authenticated, service_role;
