-- =============================================
-- FIX Misiones · FK reuniones_actividades quedaron con nombre viejo
-- =============================================
-- 046 renombró la tabla reuniones_compromisos → reuniones_actividades pero
-- Postgres no renombra las FK constraints en un ALTER TABLE RENAME.
-- El código del front (src/actions/reuniones.ts) hace embeds con hint
-- explícito por nombre de constraint:
--   profiles!reuniones_actividades_responsable_id_fkey(...)
--   reuniones!reuniones_actividades_reunion_id_fkey(...)
-- En Misiones esos hints fallan porque la constraint sigue siendo
-- reuniones_compromisos_*_fkey → PostgREST: "Could not find a relationship".
--
-- Idempotente: si ya está renombrada no hace nada.
-- =============================================

BEGIN;

-- responsable_id → profiles(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reuniones_compromisos_responsable_id_fkey'
      AND conrelid = 'reuniones_actividades'::regclass
  ) THEN
    ALTER TABLE reuniones_actividades
      RENAME CONSTRAINT reuniones_compromisos_responsable_id_fkey
                     TO reuniones_actividades_responsable_id_fkey;
  END IF;
END $$;

-- reunion_id → reuniones(id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reuniones_compromisos_reunion_id_fkey'
      AND conrelid = 'reuniones_actividades'::regclass
  ) THEN
    ALTER TABLE reuniones_actividades
      RENAME CONSTRAINT reuniones_compromisos_reunion_id_fkey
                     TO reuniones_actividades_reunion_id_fkey;
  END IF;
END $$;

-- created_by → profiles(id) (por si también tiene el nombre viejo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reuniones_compromisos_created_by_fkey'
      AND conrelid = 'reuniones_actividades'::regclass
  ) THEN
    ALTER TABLE reuniones_actividades
      RENAME CONSTRAINT reuniones_compromisos_created_by_fkey
                     TO reuniones_actividades_created_by_fkey;
  END IF;
END $$;

-- PK (no es crítico para PostgREST pero alineamos)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reuniones_compromisos_pkey'
      AND conrelid = 'reuniones_actividades'::regclass
  ) THEN
    ALTER TABLE reuniones_actividades
      RENAME CONSTRAINT reuniones_compromisos_pkey
                     TO reuniones_actividades_pkey;
  END IF;
END $$;

COMMIT;

-- =============================================
-- Verificación: deben quedar SOLO con el nombre nuevo
-- =============================================
SELECT conname
FROM pg_constraint
WHERE conrelid = 'reuniones_actividades'::regclass
  AND contype IN ('f','p')
ORDER BY conname;

-- =============================================
-- Reload schema cache PostgREST (fuera de la transacción)
-- =============================================
NOTIFY pgrst, 'reload schema';
