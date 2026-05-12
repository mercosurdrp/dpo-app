-- =============================================
-- 059 · 5S Acciones v2
-- =============================================
-- Reemplaza el modelo huerfano de la migracion 033:
--   - s5_auditoria_acciones nunca fue consumido desde el codigo.
--   - La pantalla /5s/mis-acciones importaba funciones inexistentes.
--
-- Estrategia: rename defensivo (no DROP) por si hay filas residuales,
-- y schema nuevo independiente que soporta:
--   - Tareas aisladas (sin auditoria, sin reunion)
--   - Tareas que nacen de una auditoria 5S existente
--   - Tareas que nacen de una actividad de reunion (fase futura)
--   - Historial de evidencias (comentario + archivo) por accion
--   - Estados unificados con reuniones_actividades:
--       no_comenzada / en_curso / cerrada
--
-- Archivos en bucket 's5-auditorias', prefijo 'acciones/{accion_id}/...'
--
-- Idempotente. Cleanup arriba detecta partial state + ALTER INDEX rename
-- de los indexes viejos cuyos nombres chocaban con los nuevos.
-- =============================================

BEGIN;

-- =============================================
-- a) Drop NUEVOS si quedaron a medias (CASCADE limpia
--    indexes/triggers/policies dependientes)
-- =============================================
DROP TABLE IF EXISTS s5_acciones_evidencias CASCADE;
DROP TABLE IF EXISTS s5_acciones CASCADE;

-- =============================================
-- b) Manejo idempotente del enum s5_accion_estado.
--    - VIEJO ('pendiente','resuelto'): rename a *_deprecated_2026_05
--    - NUEVO ('no_comenzada','en_curso','cerrada'): drop (sus dependientes
--      ya fueron limpiados arriba)
--    - Inexistente: no-op
-- =============================================
DO $$
DECLARE
  enum_values text[];
BEGIN
  SELECT array_agg(enumlabel ORDER BY enumsortorder)
  INTO enum_values
  FROM pg_enum
  WHERE enumtypid = (
    SELECT oid FROM pg_type
    WHERE typname = 's5_accion_estado' AND typtype = 'e'
  );

  IF enum_values IS NULL THEN
    NULL;
  ELSIF 'pendiente' = ANY(enum_values) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_type
      WHERE typname = 's5_accion_estado_deprecated_2026_05'
    ) THEN
      EXECUTE 'ALTER TYPE s5_accion_estado RENAME TO s5_accion_estado_deprecated_2026_05';
    END IF;
  ELSE
    EXECUTE 'DROP TYPE s5_accion_estado';
  END IF;
END $$;

-- =============================================
-- c) Rename idempotente de la tabla vieja
-- =============================================
ALTER TABLE IF EXISTS s5_auditoria_acciones
  RENAME TO s5_auditoria_acciones_deprecated_2026_05;

-- =============================================
-- d) Rename de INDEXES viejos cuyos nombres chocan con los nuevos.
--    La migracion 033 creo estos indexes con nombres genericos sobre
--    s5_auditoria_acciones. Al renombrar la tabla el nombre del index
--    no se actualiza, asi que ocupa el nombre que necesitamos. Los
--    movemos al sufijo deprecated.
-- =============================================
ALTER INDEX IF EXISTS idx_s5_acciones_estado
  RENAME TO idx_s5_acciones_estado_deprecated_2026_05;
ALTER INDEX IF EXISTS idx_s5_acciones_responsable
  RENAME TO idx_s5_acciones_responsable_deprecated_2026_05;
ALTER INDEX IF EXISTS idx_s5_acciones_auditoria
  RENAME TO idx_s5_acciones_auditoria_deprecated_2026_05;

-- =============================================
-- e) Enum nuevo
-- =============================================
CREATE TYPE s5_accion_estado AS ENUM (
  'no_comenzada',
  'en_curso',
  'cerrada'
);

-- =============================================
-- f) Tabla principal de acciones 5S
-- =============================================
CREATE TABLE s5_acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contexto operativo
  tipo s5_tipo NOT NULL,                    -- 'almacen' | 'flota'
  sector_numero INT,                        -- 1..4 si tipo='almacen'
  vehiculo_id UUID REFERENCES catalogo_vehiculos(id) ON DELETE SET NULL,

  -- Datos de la accion
  descripcion TEXT NOT NULL,
  responsable_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  fecha_compromiso DATE,
  estado s5_accion_estado NOT NULL DEFAULT 'no_comenzada',

  -- Origen (todos opcionales -> accion aislada)
  origen_auditoria_id UUID REFERENCES s5_auditorias(id) ON DELETE SET NULL,
  origen_reunion_actividad_id UUID,         -- FK se agrega en fase futura

  -- Auditoria
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  cerrada_at TIMESTAMPTZ,
  cerrada_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Consistencia tipo / sub-objeto
  CONSTRAINT s5_acciones_tipo_almacen_chk CHECK (
    tipo <> 'almacen'
    OR (sector_numero BETWEEN 1 AND 4 AND vehiculo_id IS NULL)
  ),
  CONSTRAINT s5_acciones_tipo_flota_chk CHECK (
    tipo <> 'flota'
    OR (sector_numero IS NULL)
  ),
  CONSTRAINT s5_acciones_cerrada_at_chk CHECK (
    (estado = 'cerrada' AND cerrada_at IS NOT NULL)
    OR (estado <> 'cerrada' AND cerrada_at IS NULL)
  )
);

CREATE INDEX idx_s5_acciones_tipo             ON s5_acciones(tipo);
CREATE INDEX idx_s5_acciones_estado           ON s5_acciones(estado);
CREATE INDEX idx_s5_acciones_responsable      ON s5_acciones(responsable_id);
CREATE INDEX idx_s5_acciones_origen_auditoria ON s5_acciones(origen_auditoria_id);
CREATE INDEX idx_s5_acciones_fecha_compromiso ON s5_acciones(fecha_compromiso);

CREATE TRIGGER trg_s5_acciones_updated_at
  BEFORE UPDATE ON s5_acciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_acciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_acciones_read"
  ON s5_acciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_acciones_insert"
  ON s5_acciones FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','auditor')
    )
  );

CREATE POLICY "s5_acciones_update"
  ON s5_acciones FOR UPDATE TO authenticated
  USING (
    responsable_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','auditor')
    )
  );

CREATE POLICY "s5_acciones_delete"
  ON s5_acciones FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','auditor')
    )
  );

-- =============================================
-- g) Historial de evidencias por accion
-- =============================================
CREATE TABLE s5_acciones_evidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accion_id UUID NOT NULL REFERENCES s5_acciones(id) ON DELETE CASCADE,
  comentario TEXT,
  archivo_path TEXT,                        -- bucket 's5-auditorias'
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  autor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT s5_acciones_evidencias_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  )
);

CREATE INDEX idx_s5_acciones_evid_accion  ON s5_acciones_evidencias(accion_id);
CREATE INDEX idx_s5_acciones_evid_autor   ON s5_acciones_evidencias(autor_id);
CREATE INDEX idx_s5_acciones_evid_created ON s5_acciones_evidencias(created_at);

ALTER TABLE s5_acciones_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_acciones_evid_read"
  ON s5_acciones_evidencias FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_acciones_evid_insert"
  ON s5_acciones_evidencias FOR INSERT TO authenticated
  WITH CHECK (
    accion_id IN (
      SELECT s5_acciones.id
      FROM s5_acciones
      WHERE s5_acciones.responsable_id = auth.uid()
         OR s5_acciones.creado_por = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','auditor')
    )
  );

CREATE POLICY "s5_acciones_evid_delete"
  ON s5_acciones_evidencias FOR DELETE TO authenticated
  USING (
    autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','auditor')
    )
  );

COMMIT;

-- Reload PostgREST schema cache (fuera de la transaccion)
NOTIFY pgrst, 'reload schema';
