-- Km del mes del modelo de Costo por PDV: sólo cargas de GASOIL.
--
-- El $/km = distribución ÷ km del mes, y los km salen de la suma de
-- registro_combustible.km_recorridos (desde mayo 2026). Desde octubre 2026
-- las cargas de UREA también traen km (los del mismo camión, ya contados en su
-- carga de gasoil): se sumaban dos veces, bajaba el $/km y el costo se corría
-- de las ciudades lejanas a las cercanas (oct 2026: Colón 38.716 se veía
-- 34.600; Ramallo 10.990 se veía 13.537). El 13/11/2026 se pusieron en 0 los
-- km de las dos cargas de urea de octubre; esto evita que vuelva a pasar.
--
-- Parche en el lugar (como 20260720160000): a toda función de public que sume
-- km_recorridos de registro_combustible se le agrega
-- FILTER (WHERE tipo_combustible = 'gasoil') a ese sum. Idempotente.

DO $mig$
DECLARE
  r record;
  d text;
  d2 text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~* 'sum\(km_recorridos\)\s+from\s+registro_combustible'
  LOOP
    d := pg_get_functiondef(r.oid);
    d2 := regexp_replace(
      d,
      'sum\(km_recorridos\)(\s+from\s+registro_combustible)',
      'sum(km_recorridos) filter (where tipo_combustible = ''gasoil'')\1',
      'gi'
    );
    IF d2 <> d THEN
      EXECUTE d2;
      n := n + 1;
      RAISE NOTICE 'Parcheada: %', r.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'Funciones parcheadas: %', n;
END $mig$;

-- Verificación: tiene que devolver 0 filas.
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND pg_get_functiondef(p.oid) ~* 'sum\(km_recorridos\)\s+from\s+registro_combustible';
