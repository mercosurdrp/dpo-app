-- =============================================
-- Ausentismo (Pampeana)
-- Registro línea por línea de eventos de ausentismo / licencias médicas /
-- accidentes / licencias gremiales. Permite adjuntar un archivo por evento
-- y soporta los reportes de repitencia y análisis de licencias médicas.
--
-- Aplicar SOLO en la Supabase de Pampeana (dpo-app-self). El sidebar marca
-- la entrada como pampeanaOnly, y las consultas se gatean con IS_MISIONES
-- para que en Misiones la app nunca consulte estas tablas.
-- =============================================

CREATE TABLE IF NOT EXISTS ausentismo_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  fecha_inicio DATE NOT NULL,
  dias INT NOT NULL CHECK (dias >= 1 AND dias <= 365),
  -- Se persiste para indexar/filtrar y poder hacer reportes por rango sin
  -- recomputar en cada query. Se mantiene consistente vía trigger.
  fecha_fin DATE NOT NULL,
  motivo TEXT NOT NULL CHECK (motivo IN (
    'ausencia',
    'licencia_medica',
    'enfermedad_profesional',
    'accidente',
    'otras_licencias',
    'licencia_gremial'
  )),
  comentario TEXT,
  archivo_path TEXT,
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ausentismo_empleado
  ON ausentismo_eventos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_ausentismo_fecha_inicio
  ON ausentismo_eventos(fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_ausentismo_motivo
  ON ausentismo_eventos(motivo);

-- fecha_fin = fecha_inicio + (dias - 1). Mantenido por trigger; el día 1
-- es el propio de inicio, así un evento de 1 día tiene fin = inicio.
CREATE OR REPLACE FUNCTION ausentismo_set_fecha_fin()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_fin := NEW.fecha_inicio + (NEW.dias - 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ausentismo_fecha_fin ON ausentismo_eventos;
CREATE TRIGGER trg_ausentismo_fecha_fin
  BEFORE INSERT OR UPDATE OF fecha_inicio, dias ON ausentismo_eventos
  FOR EACH ROW EXECUTE FUNCTION ausentismo_set_fecha_fin();

DROP TRIGGER IF EXISTS trg_ausentismo_updated_at ON ausentismo_eventos;
CREATE TRIGGER trg_ausentismo_updated_at
  BEFORE UPDATE ON ausentismo_eventos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ausentismo_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ausentismo_read" ON ausentismo_eventos;
CREATE POLICY "ausentismo_read"
  ON ausentismo_eventos FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin','admin_rrhh'))
  );

DROP POLICY IF EXISTS "ausentismo_write" ON ausentismo_eventos;
CREATE POLICY "ausentismo_write"
  ON ausentismo_eventos FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin','admin_rrhh'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin','admin_rrhh'))
  );

-- Bucket privado para certificados / partes médicos. Los path se guardan en
-- ausentismo_eventos.archivo_path; se accede vía URLs firmadas server-side.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ausentismo', 'ausentismo', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ausentismo_storage_read" ON storage.objects;
CREATE POLICY "ausentismo_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ausentismo'
    AND EXISTS (SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                  AND p.role IN ('admin','admin_rrhh'))
  );

DROP POLICY IF EXISTS "ausentismo_storage_write" ON storage.objects;
CREATE POLICY "ausentismo_storage_write"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'ausentismo'
    AND EXISTS (SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                  AND p.role IN ('admin','admin_rrhh'))
  )
  WITH CHECK (
    bucket_id = 'ausentismo'
    AND EXISTS (SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                  AND p.role IN ('admin','admin_rrhh'))
  );
