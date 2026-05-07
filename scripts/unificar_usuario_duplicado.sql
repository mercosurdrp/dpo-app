-- =============================================
-- Unificar usuario duplicado: Esteban Altube
-- =============================================
-- target  (mantener) : ealtube@mercosur.local
-- source  (eliminar) : ealtube@mercosurdrp.com.ar
--
-- Qué hace:
--   1) Verifica que ambos usuarios existen.
--   2) Para tablas con UNIQUE que incluyen profile_id (donde sumar dos
--      filas violaría la constraint), borra primero las filas del
--      duplicado que ya tienen equivalente en el principal.
--   3) Reasigna TODAS las FK que apuntan a profiles(id): cualquier
--      columna referenciando al duplicado se redirige al principal.
--   4) Verifica que no quede ningún registro apuntando al duplicado.
--
-- IMPORTANTE: este script NO borra el row de profiles ni el row de
-- auth.users. Cuando termine, andá a /admin/usuarios y eliminá manualmente
-- a "Esteban Altube" (ealtube@mercosurdrp.com.ar) desde el menú ⋮.
--
-- Idempotente: si lo corrés una segunda vez, no hace nada (no encuentra al
-- source o no encuentra rows que reasignar).
-- =============================================

DO $$
DECLARE
  v_source_id uuid;
  v_target_id uuid;
  fk_rec record;
  v_count bigint;
  v_total_remap bigint := 0;
BEGIN
  -- ----------------------------------------
  -- 1) Identificar usuarios
  -- ----------------------------------------
  SELECT id INTO v_source_id FROM profiles WHERE email = 'ealtube@mercosurdrp.com.ar';
  SELECT id INTO v_target_id FROM profiles WHERE email = 'ealtube@mercosur.local';

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'No encontré el usuario principal ealtube@mercosur.local';
  END IF;

  IF v_source_id IS NULL THEN
    RAISE NOTICE 'No encontré ealtube@mercosurdrp.com.ar — nada para unificar (¿ya se hizo?)';
    RETURN;
  END IF;

  IF v_source_id = v_target_id THEN
    RAISE EXCEPTION 'source y target son el mismo usuario, abortando';
  END IF;

  RAISE NOTICE 'Source (eliminar): % — Target (mantener): %', v_source_id, v_target_id;

  -- ----------------------------------------
  -- 2) Dedup: tablas con UNIQUE incluyendo profile_id
  --    (si el principal ya tiene la fila, borrar la del duplicado)
  -- ----------------------------------------

  -- plan_responsables UNIQUE (plan_id, profile_id)
  DELETE FROM plan_responsables s
  WHERE s.profile_id = v_source_id
    AND EXISTS (
      SELECT 1 FROM plan_responsables t
      WHERE t.plan_id = s.plan_id AND t.profile_id = v_target_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'plan_responsables: % filas duplicadas borradas', v_count;

  -- reuniones_participantes_fijos UNIQUE (tipo, profile_id)
  DELETE FROM reuniones_participantes_fijos s
  WHERE s.profile_id = v_source_id
    AND EXISTS (
      SELECT 1 FROM reuniones_participantes_fijos t
      WHERE t.tipo = s.tipo AND t.profile_id = v_target_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'reuniones_participantes_fijos: % filas duplicadas borradas', v_count;

  -- reuniones_asistentes UNIQUE (reunion_id, profile_id)
  DELETE FROM reuniones_asistentes s
  WHERE s.profile_id = v_source_id
    AND EXISTS (
      SELECT 1 FROM reuniones_asistentes t
      WHERE t.reunion_id = s.reunion_id AND t.profile_id = v_target_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'reuniones_asistentes: % filas duplicadas borradas', v_count;

  -- ----------------------------------------
  -- 3) Reasignar TODAS las FK incoming a profiles
  -- ----------------------------------------
  -- Esto recorre information_schema y hace UPDATE en cada (tabla, columna)
  -- que apunte a profiles(id), reemplazando source → target.
  FOR fk_rec IN
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name   = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = tc.constraint_schema
     AND rc.constraint_name   = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = rc.unique_constraint_schema
     AND ccu.constraint_name   = rc.unique_constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND ccu.table_name   = 'profiles'
      AND ccu.column_name  = 'id'
      -- Excluir self-FK de profiles a sí mismo (si existiera) para no
      -- modificar el row del propio source antes de tiempo.
      AND NOT (tc.table_name = 'profiles' AND kcu.column_name = 'id')
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      fk_rec.table_schema, fk_rec.table_name,
      fk_rec.column_name, fk_rec.column_name
    ) USING v_target_id, v_source_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RAISE NOTICE '  remap %.% : %', fk_rec.table_name, fk_rec.column_name, v_count;
      v_total_remap := v_total_remap + v_count;
    END IF;
  END LOOP;

  RAISE NOTICE '----';
  RAISE NOTICE 'Total filas reasignadas: %', v_total_remap;

  -- ----------------------------------------
  -- 4) Verificación: ninguna FK debería seguir apuntando al source
  -- ----------------------------------------
  FOR fk_rec IN
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name   = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = tc.constraint_schema
     AND rc.constraint_name   = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = rc.unique_constraint_schema
     AND ccu.constraint_name   = rc.unique_constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND ccu.table_name   = 'profiles'
      AND ccu.column_name  = 'id'
      AND NOT (tc.table_name = 'profiles' AND kcu.column_name = 'id')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I = $1',
      fk_rec.table_schema, fk_rec.table_name, fk_rec.column_name
    ) INTO v_count USING v_source_id;
    IF v_count > 0 THEN
      RAISE WARNING 'TODAVÍA QUEDAN % refs en %.% — revisar manualmente',
        v_count, fk_rec.table_name, fk_rec.column_name;
    END IF;
  END LOOP;

  RAISE NOTICE '----';
  RAISE NOTICE 'Listo. Ahora andá a /admin/usuarios y eliminá manualmente al usuario %', 'ealtube@mercosurdrp.com.ar';
END $$;
