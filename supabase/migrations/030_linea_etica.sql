-- =============================================
-- Línea Ética (canal de compliance)
-- - Formulario público anónimo (QR comedor): INSERT sin auth
-- - Listado visible a cualquier autenticado (las denuncias ya son anónimas
--   o con identificación voluntaria; no hay riesgo de filtrar denunciante)
-- - Estado + resumen de tratamiento + vínculo con planes_accion y archivos
-- =============================================

-- =============================================
-- Enums
-- =============================================
CREATE TYPE linea_etica_tipo AS ENUM (
  'conducta_indebida',
  'acoso',
  'discriminacion',
  'corrupcion',
  'fraude',
  'conflicto_interes',
  'represalia',
  'otro'
);

CREATE TYPE linea_etica_estado AS ENUM (
  'nueva',
  'en_revision',
  'en_tratamiento',
  'cerrada'
);

-- =============================================
-- Tabla principal
-- =============================================
CREATE TABLE denuncias_linea_etica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Contenido de la denuncia
  tipo linea_etica_tipo NOT NULL,
  descripcion TEXT NOT NULL,
  lugar TEXT,
  area reporte_seguridad_area,
  localidad reporte_seguridad_localidad,
  fecha_hecho DATE,
  -- Identificación opcional (el resto de denunciantes permanecen anónimos)
  identificarse BOOLEAN NOT NULL DEFAULT false,
  denunciante_nombre TEXT,
  denunciante_contacto TEXT,
  -- Tratamiento
  estado linea_etica_estado NOT NULL DEFAULT 'nueva',
  resumen_tratamiento TEXT,
  cerrada_por UUID REFERENCES profiles(id),
  cerrada_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_denuncias_linea_etica_created_at ON denuncias_linea_etica(created_at DESC);
CREATE INDEX idx_denuncias_linea_etica_tipo ON denuncias_linea_etica(tipo);
CREATE INDEX idx_denuncias_linea_etica_estado ON denuncias_linea_etica(estado);

-- =============================================
-- Adjuntos (evidencia aportada + evidencia de tratamiento)
-- origen: 'denuncia' (subido con la denuncia) o 'tratamiento' (subido después)
-- =============================================
CREATE TABLE linea_etica_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  denuncia_id UUID NOT NULL REFERENCES denuncias_linea_etica(id) ON DELETE CASCADE,
  origen TEXT NOT NULL DEFAULT 'denuncia' CHECK (origen IN ('denuncia', 'tratamiento')),
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  subido_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_linea_etica_adjuntos_denuncia ON linea_etica_adjuntos(denuncia_id);

-- =============================================
-- M2M con planes_accion
-- =============================================
CREATE TABLE linea_etica_plan_accion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  denuncia_id UUID NOT NULL REFERENCES denuncias_linea_etica(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (denuncia_id, plan_id)
);

CREATE INDEX idx_linea_etica_plan_accion_denuncia ON linea_etica_plan_accion(denuncia_id);
CREATE INDEX idx_linea_etica_plan_accion_plan ON linea_etica_plan_accion(plan_id);

-- =============================================
-- Storage bucket (público, coherente con reportes-seguridad)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('linea-etica', 'linea-etica', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "linea_etica_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'linea-etica');

-- Insert público (via service role en la action pública)
CREATE POLICY "linea_etica_storage_insert_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'linea-etica');

CREATE POLICY "linea_etica_storage_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'linea-etica'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- Trigger updated_at
-- =============================================
CREATE TRIGGER trg_denuncias_linea_etica_updated_at
  BEFORE UPDATE ON denuncias_linea_etica
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Trigger: notificar a todos los usuarios activos al crear una denuncia
-- =============================================
CREATE OR REPLACE FUNCTION notificar_nueva_denuncia_linea_etica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  SELECT
    p.id,
    'linea_etica',
    'Nueva denuncia - Línea Ética',
    LEFT(NEW.descripcion, 140),
    '/compliance/linea-etica/' || NEW.id::text
  FROM profiles p
  WHERE COALESCE(p.active, true) = true;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_nueva_denuncia_linea_etica
  AFTER INSERT ON denuncias_linea_etica
  FOR EACH ROW EXECUTE FUNCTION notificar_nueva_denuncia_linea_etica();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE denuncias_linea_etica ENABLE ROW LEVEL SECURITY;
ALTER TABLE linea_etica_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE linea_etica_plan_accion ENABLE ROW LEVEL SECURITY;

-- Denuncias: cualquier autenticado puede leer.
-- El INSERT desde el formulario público va por service role (bypass RLS).
CREATE POLICY "linea_etica_read"
  ON denuncias_linea_etica FOR SELECT TO authenticated USING (true);

CREATE POLICY "linea_etica_update_auth"
  ON denuncias_linea_etica FOR UPDATE TO authenticated USING (true);

CREATE POLICY "linea_etica_delete_admin"
  ON denuncias_linea_etica FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Adjuntos
CREATE POLICY "linea_etica_adjuntos_read"
  ON linea_etica_adjuntos FOR SELECT TO authenticated USING (true);

CREATE POLICY "linea_etica_adjuntos_insert"
  ON linea_etica_adjuntos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "linea_etica_adjuntos_delete_admin"
  ON linea_etica_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- M2M con planes
CREATE POLICY "linea_etica_plan_accion_read"
  ON linea_etica_plan_accion FOR SELECT TO authenticated USING (true);

CREATE POLICY "linea_etica_plan_accion_insert"
  ON linea_etica_plan_accion FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "linea_etica_plan_accion_delete"
  ON linea_etica_plan_accion FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
