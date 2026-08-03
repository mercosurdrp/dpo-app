-- =============================================
-- 5S — "Mi sector": el operario sorteado ve sus tareas del mes
-- y carga evidencia (foto + comentario) desde su propia cuenta.
--
-- Hasta ahora el sorteo (s5_sector_responsables) solo se veía desde el
-- panel de admin: el responsable no se enteraba en su app y la única
-- evidencia posible era la que cargaba el auditor.
-- =============================================

-- ---------------------------------------------
-- Tareas del mes por sector.
-- El checklist de auditoría (s5_items_catalogo) ya define QUÉ se evalúa;
-- esta tabla es para las tareas puntuales que se agregan a un sector en
-- un mes concreto ("ordenar el pallet de devoluciones", etc.).
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS s5_tareas_sector (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo DATE NOT NULL,                       -- día 01 del mes
  sector_numero INT NOT NULL CHECK (sector_numero BETWEEN 1 AND 4),
  categoria s5_categoria,                      -- a qué S corresponde (opcional)
  titulo TEXT NOT NULL,
  descripcion TEXT,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_s5_tareas_sector_periodo
  ON s5_tareas_sector(periodo, sector_numero);

CREATE TRIGGER trg_s5_tareas_sector_updated_at
  BEFORE UPDATE ON s5_tareas_sector
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------
-- Evidencias que carga el responsable del sector.
-- item_id / tarea_id son opcionales: se puede subir una foto suelta
-- ("así quedó el pasillo") sin colgarla de ninguna tarea.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS s5_evidencias_sector (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo DATE NOT NULL,                       -- día 01 del mes
  sector_numero INT NOT NULL CHECK (sector_numero BETWEEN 1 AND 4),
  item_id UUID REFERENCES s5_items_catalogo(id) ON DELETE SET NULL,
  tarea_id UUID REFERENCES s5_tareas_sector(id) ON DELETE SET NULL,
  categoria s5_categoria,
  comentario TEXT NOT NULL,
  storage_path TEXT,                           -- bucket s5-auditorias, prefijo sector/
  mime_type TEXT,
  tamano_bytes BIGINT,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_s5_evid_sector_periodo
  ON s5_evidencias_sector(periodo, sector_numero);
CREATE INDEX IF NOT EXISTS idx_s5_evid_sector_profile
  ON s5_evidencias_sector(profile_id);
CREATE INDEX IF NOT EXISTS idx_s5_evid_sector_created
  ON s5_evidencias_sector(created_at DESC);

-- ---------------------------------------------
-- ¿El usuario logueado es el responsable sorteado de ese sector/mes?
-- SECURITY DEFINER para que la RLS no dependa de que el operario pueda
-- leer empleados/s5_sector_responsables.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION s5_es_responsable(p_periodo DATE, p_sector INT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM s5_sector_responsables r
    JOIN empleados e ON e.id = r.empleado_id
    WHERE r.periodo = p_periodo
      AND r.sector_numero = p_sector
      AND e.profile_id = auth.uid()
  );
$$;

-- Variante por texto para la política de storage: el path lo arma el cliente,
-- así que un cast directo a date/int en la policy podría explotar con un
-- nombre mal formado. Acá se valida el formato antes de castear.
CREATE OR REPLACE FUNCTION s5_es_responsable_path(p_periodo TEXT, p_sector TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_periodo !~ '^\d{4}-\d{2}-\d{2}$' OR p_sector !~ '^\d+$' THEN
    RETURN false;
  END IF;
  RETURN s5_es_responsable(p_periodo::date, p_sector::int);
END;
$$;

-- ---------------------------------------------
-- RLS
-- ---------------------------------------------
ALTER TABLE s5_tareas_sector ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_tareas_sector_read"
  ON s5_tareas_sector FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_tareas_sector_write"
  ON s5_tareas_sector FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

ALTER TABLE s5_evidencias_sector ENABLE ROW LEVEL SECURITY;

-- Lectura: todos. La evidencia es pública dentro de la empresa a propósito
-- — que se vea el trabajo del compañero es parte del incentivo.
CREATE POLICY "s5_evid_sector_read"
  ON s5_evidencias_sector FOR SELECT TO authenticated USING (true);

-- Carga: el responsable del sector en ese período, o admin/auditor.
CREATE POLICY "s5_evid_sector_insert"
  ON s5_evidencias_sector FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND (
      s5_es_responsable(periodo, sector_numero)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
    )
  );

-- Borrado: el autor puede borrar lo suyo (foto mal sacada); admin/auditor todo.
CREATE POLICY "s5_evid_sector_delete"
  ON s5_evidencias_sector FOR DELETE TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'auditor'))
  );

-- ---------------------------------------------
-- Storage: el responsable sube bajo sector/{periodo}/{sector_numero}/
-- Se reescribe la política de INSERT del bucket sumando esa rama a las
-- que ya existían (admin/auditor + responsable de acción).
-- ---------------------------------------------
DROP POLICY IF EXISTS "s5_auditorias_insert" ON storage.objects;

CREATE POLICY "s5_auditorias_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 's5-auditorias'
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'auditor')
      )
      OR (
        (storage.foldername(name))[1] = 'acciones'
        AND EXISTS (
          SELECT 1 FROM s5_acciones a
          WHERE a.id::text = (storage.foldername(name))[2]
            AND (a.responsable_id = auth.uid() OR a.creado_por = auth.uid())
        )
      )
      OR (
        (storage.foldername(name))[1] = 'sector'
        AND s5_es_responsable_path(
          (storage.foldername(name))[2],
          (storage.foldername(name))[3]
        )
      )
    )
  );
