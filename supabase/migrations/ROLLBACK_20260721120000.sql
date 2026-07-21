-- ROLLBACK de 20260721120000_costo_pdv_bolsa_deposito.sql
-- NO se aplica automáticamente. Correr a mano sólo si hay que volver atrás:
-- devuelve el reparto del almacén a los bultos distribuidos (b_tot).

DO $rb$
DECLARE
  f     text;
  def   text;
  nueva text;
BEGIN
  FOREACH f IN ARRAY ARRAY['get_costo_por_pdv','get_costo_por_pdv_sim'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f;

    IF def IS NULL OR position('bvend' in def) = 0 THEN
      RAISE NOTICE '% no tiene el cambio aplicado, se omite', f;
      CONTINUE;
    END IF;

    nueva := replace(def,
      '(select almacen from costo) * bg.bultos / nullif((select b_vend from bvend),0)',
      '(select almacen from costo) * bg.bultos / nullif((select b_tot from tot),0)');

    -- saca el CTE bvend completo (desde "bvend as (" hasta el cierre ",")
    nueva := regexp_replace(nueva, E'\\n  bvend as \\(.*?\\n  \\),', '', 'n');

    EXECUTE nueva;
    RAISE NOTICE '% revertida', f;
  END LOOP;
END
$rb$;

DROP FUNCTION IF EXISTS public.get_bolsa_deposito(integer,integer);
