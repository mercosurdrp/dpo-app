-- =============================================
-- Reportes de Seguridad + Notificaciones
-- Tipos: accidente / incidente / acto_inseguro / ruta_riesgo / acto_seguro
-- =============================================

-- =============================================
-- Enums
-- =============================================
CREATE TYPE reporte_seguridad_tipo AS ENUM (
  'accidente',
  'incidente',
  'acto_inseguro',
  'ruta_riesgo',
  'acto_seguro'
);

CREATE TYPE reporte_seguridad_localidad AS ENUM (
  'san_nicolas',
  'ramallo',
  'pergamino',
  'colon',
  'otro'
);

CREATE TYPE reporte_seguridad_area AS ENUM (
  'deposito',
  'distribucion',
  'ventas',
  'administracion'
);

CREATE TYPE reporte_seguridad_puesto AS ENUM (
  'ayudante_distribucion',
  'chofer_distribucion',
  'operario_deposito',
  'promotor_ventas',
  'repositor',
  'administracion',
  'mando_medio',
  'otro'
);

-- =============================================
-- Tabla principal
-- =============================================
CREATE TABLE reportes_seguridad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo reporte_seguridad_tipo NOT NULL,
  fecha DATE NOT NULL,
  hora TIME,
  descripcion TEXT NOT NULL,
  accion_tomada TEXT,
  lugar TEXT,
  localidad reporte_seguridad_localidad,
  area reporte_seguridad_area,
  -- Específicos accidente / incidente
  damnificado_nombre TEXT,
  damnificado_puesto reporte_seguridad_puesto,
  dentro_cd BOOLEAN,
  sif BOOLEAN,
  -- Específicos acto inseguro / ruta riesgo / acto seguro
  quien_que TEXT,
  -- Metadata
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reportes_seguridad_created_at ON reportes_seguridad(created_at DESC);
CREATE INDEX idx_reportes_seguridad_tipo ON reportes_seguridad(tipo);
CREATE INDEX idx_reportes_seguridad_creado_por ON reportes_seguridad(creado_por);
CREATE INDEX idx_reportes_seguridad_fecha ON reportes_seguridad(fecha DESC);

-- =============================================
-- Adjuntos (fotos / audios / videos)
-- =============================================
CREATE TABLE reporte_seguridad_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id UUID NOT NULL REFERENCES reportes_seguridad(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reporte_seguridad_adjuntos_reporte ON reporte_seguridad_adjuntos(reporte_id);

-- =============================================
-- Notificaciones (genérica, reutilizable)
-- =============================================
CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT,
  link TEXT,
  leida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificaciones_user_leida ON notificaciones(user_id, leida);
CREATE INDEX idx_notificaciones_created_at ON notificaciones(created_at DESC);

-- =============================================
-- Storage bucket (público, igual al approach de dpo-evidencia pero público)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('reportes-seguridad', 'reportes-seguridad', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "reportes_seguridad_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reportes-seguridad');

CREATE POLICY "reportes_seguridad_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reportes-seguridad');

CREATE POLICY "reportes_seguridad_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'reportes-seguridad');

CREATE POLICY "reportes_seguridad_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'reportes-seguridad'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- Trigger updated_at
-- =============================================
CREATE TRIGGER trg_reportes_seguridad_updated_at
  BEFORE UPDATE ON reportes_seguridad
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Function + trigger: notificar a todos los usuarios al crear un reporte
-- =============================================
CREATE OR REPLACE FUNCTION notificar_nuevo_reporte_seguridad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
BEGIN
  v_titulo := CASE NEW.tipo
    WHEN 'accidente' THEN 'Nuevo reporte: Accidente'
    WHEN 'incidente' THEN 'Nuevo reporte: Incidente'
    WHEN 'acto_inseguro' THEN 'Nuevo reporte: Acto / condición insegura'
    WHEN 'ruta_riesgo' THEN 'Nuevo reporte: Ruta de riesgo'
    WHEN 'acto_seguro' THEN 'Reconocimiento: Acto seguro'
    ELSE 'Nuevo reporte de seguridad'
  END;

  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  SELECT
    p.id,
    'reporte_seguridad',
    v_titulo,
    LEFT(NEW.descripcion, 140),
    '/reportes-seguridad'
  FROM profiles p
  WHERE p.id <> NEW.creado_por
    AND COALESCE(p.active, true) = true;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_nuevo_reporte_seguridad
  AFTER INSERT ON reportes_seguridad
  FOR EACH ROW EXECUTE FUNCTION notificar_nuevo_reporte_seguridad();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE reportes_seguridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporte_seguridad_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Reportes: lectura pública interna; crear cualquier authenticated; update/delete solo admin
CREATE POLICY "reportes_seguridad_read"
  ON reportes_seguridad FOR SELECT TO authenticated USING (true);

CREATE POLICY "reportes_seguridad_insert"
  ON reportes_seguridad FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

CREATE POLICY "reportes_seguridad_update"
  ON reportes_seguridad FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "reportes_seguridad_delete"
  ON reportes_seguridad FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Adjuntos
CREATE POLICY "reporte_seguridad_adjuntos_read"
  ON reporte_seguridad_adjuntos FOR SELECT TO authenticated USING (true);

CREATE POLICY "reporte_seguridad_adjuntos_insert"
  ON reporte_seguridad_adjuntos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM reportes_seguridad r
      WHERE r.id = reporte_seguridad_adjuntos.reporte_id
        AND r.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "reporte_seguridad_adjuntos_delete"
  ON reporte_seguridad_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Notificaciones: cada usuario solo ve/edita/borra las suyas.
-- Insert queda reservado al trigger (SECURITY DEFINER). No se expone al cliente.
CREATE POLICY "notificaciones_read"
  ON notificaciones FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notificaciones_update"
  ON notificaciones FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notificaciones_delete"
  ON notificaciones FOR DELETE TO authenticated
  USING (user_id = auth.uid());
