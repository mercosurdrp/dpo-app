-- =============================================
-- 060 · Reuniones · Actividad → destino (espejo 5S)
-- =============================================
-- Fase 1: Bidireccionalidad entre el action log de reuniones
-- (warehouse / matinal-distribucion / logistica) y el módulo 5S.
--
-- Una actividad de reunión puede tener un destino:
--   - 'simple':                 tarea aislada en reuniones (default, comportamiento previo)
--   - '5s_flota':               espeja en s5_acciones (tipo='flota', sector=null,
--                               vehiculo opcional)
--   - '5s_almacen':             espeja en s5_acciones (tipo='almacen', sector 1..4,
--                               vehiculo=null)
--   - 'mantenimiento_edilicio': placeholder Fase 2 (texto libre `rubro`)
--
-- La FK s5_acciones.origen_reunion_actividad_id ya existía como columna desde la
-- migración 059 pero sin constraint; acá se activa apuntando a reuniones_actividades(id)
-- con ON DELETE SET NULL (el espejo 5S sobrevive si se borra la actividad origen, pero
-- la lógica de servidor ya borra el espejo cuando se borra/destransiciona la actividad).
--
-- Idempotente. NOTIFY pgrst al final fuera de transacción.
-- =============================================

BEGIN;

-- =============================================
-- a) Enum tarea_destino
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'tarea_destino' AND typtype = 'e'
  ) THEN
    CREATE TYPE tarea_destino AS ENUM (
      'simple',
      '5s_flota',
      '5s_almacen',
      'mantenimiento_edilicio'
    );
  END IF;
END $$;

-- =============================================
-- b) Columnas en reuniones_actividades
-- =============================================
ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS destino tarea_destino NOT NULL DEFAULT 'simple';

ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS s5_sector_numero INT;

ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS s5_vehiculo_id UUID;

ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS mantenimiento_rubro TEXT;

-- FK s5_vehiculo_id → catalogo_vehiculos. Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reuniones_actividades_s5_vehiculo_id_fkey'
  ) THEN
    ALTER TABLE reuniones_actividades
      ADD CONSTRAINT reuniones_actividades_s5_vehiculo_id_fkey
      FOREIGN KEY (s5_vehiculo_id)
      REFERENCES catalogo_vehiculos(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================
-- c) CHECKs de consistencia destino ↔ sub-campos
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reuniones_actividades_destino_consistencia_chk'
  ) THEN
    ALTER TABLE reuniones_actividades
      ADD CONSTRAINT reuniones_actividades_destino_consistencia_chk CHECK (
        (
          destino = 'simple'
          AND s5_sector_numero IS NULL
          AND s5_vehiculo_id IS NULL
          AND mantenimiento_rubro IS NULL
        )
        OR (
          destino = '5s_almacen'
          AND s5_sector_numero IS NOT NULL
          AND s5_sector_numero BETWEEN 1 AND 4
          AND s5_vehiculo_id IS NULL
          AND mantenimiento_rubro IS NULL
        )
        OR (
          destino = '5s_flota'
          AND s5_sector_numero IS NULL
          AND mantenimiento_rubro IS NULL
        )
        OR (
          destino = 'mantenimiento_edilicio'
          AND s5_sector_numero IS NULL
          AND s5_vehiculo_id IS NULL
          AND mantenimiento_rubro IS NOT NULL
          AND btrim(mantenimiento_rubro) <> ''
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reuniones_actividades_destino
  ON reuniones_actividades(destino);

-- =============================================
-- d) Activar FK s5_acciones.origen_reunion_actividad_id
--    La columna existe desde 059 sin constraint.
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 's5_acciones_origen_reunion_actividad_id_fkey'
  ) THEN
    ALTER TABLE s5_acciones
      ADD CONSTRAINT s5_acciones_origen_reunion_actividad_id_fkey
      FOREIGN KEY (origen_reunion_actividad_id)
      REFERENCES reuniones_actividades(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_s5_acciones_origen_reunion_actividad
  ON s5_acciones(origen_reunion_actividad_id);

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
