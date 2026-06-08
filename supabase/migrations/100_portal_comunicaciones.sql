-- =============================================
-- Portal del Empleado · Buzón de Comunicaciones
-- Comunicaciones internas con confirmación de lectura por usuario.
-- Reutiliza la tabla `notificaciones` (025) + buckets de storage como
-- reportes_seguridad. Idempotente (re-ejecutable en Misiones y Pampeana).
-- =============================================

-- =============================================
-- Enums
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacion_categoria') THEN
    CREATE TYPE comunicacion_categoria AS ENUM (
      'rrhh',
      'seguridad_higiene',
      'operaciones',
      'logistica',
      'sistemas',
      'direccion_general'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacion_prioridad') THEN
    CREATE TYPE comunicacion_prioridad AS ENUM ('baja', 'media', 'alta');
  END IF;
END $$;

-- =============================================
-- Tabla principal
-- Una comunicación es visible cuando publicado = true Y publicar_en <= now().
-- publicar_en en el futuro = comunicación programada.
-- destinatarios_roles NULL = todos; si trae roles, sólo esos roles la ven.
-- =============================================
CREATE TABLE IF NOT EXISTS comunicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  categoria comunicacion_categoria NOT NULL,
  prioridad comunicacion_prioridad NOT NULL DEFAULT 'media',
  destinatarios_roles TEXT[] DEFAULT NULL,
  publicado BOOLEAN NOT NULL DEFAULT true,
  publicar_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  notificado_at TIMESTAMPTZ DEFAULT NULL,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comunicaciones_publicar_en ON comunicaciones(publicar_en DESC);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_categoria ON comunicaciones(categoria);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_creado_por ON comunicaciones(creado_por);

-- =============================================
-- Adjuntos descargables
-- =============================================
CREATE TABLE IF NOT EXISTS comunicacion_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comunicacion_id UUID NOT NULL REFERENCES comunicaciones(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comunicacion_adjuntos_com ON comunicacion_adjuntos(comunicacion_id);

-- =============================================
-- Confirmaciones de lectura (una fila por usuario que confirmó leer)
-- =============================================
CREATE TABLE IF NOT EXISTS comunicacion_lecturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comunicacion_id UUID NOT NULL REFERENCES comunicaciones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comunicacion_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comunicacion_lecturas_com ON comunicacion_lecturas(comunicacion_id);
CREATE INDEX IF NOT EXISTS idx_comunicacion_lecturas_user ON comunicacion_lecturas(user_id);

-- =============================================
-- Storage bucket (mismo approach que reportes-seguridad)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-comunicaciones', 'portal-comunicaciones', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "portal_comunicaciones_storage_read" ON storage.objects;
CREATE POLICY "portal_comunicaciones_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'portal-comunicaciones');

DROP POLICY IF EXISTS "portal_comunicaciones_storage_insert" ON storage.objects;
CREATE POLICY "portal_comunicaciones_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-comunicaciones'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "portal_comunicaciones_storage_delete" ON storage.objects;
CREATE POLICY "portal_comunicaciones_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-comunicaciones'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- Trigger updated_at (función update_updated_at() ya existe en el schema base)
-- =============================================
DROP TRIGGER IF EXISTS trg_comunicaciones_updated_at ON comunicaciones;
CREATE TRIGGER trg_comunicaciones_updated_at
  BEFORE UPDATE ON comunicaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- BEFORE: marcar notificado_at cuando la comunicación se vuelve visible
-- =============================================
CREATE OR REPLACE FUNCTION marcar_comunicacion_notificada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.publicado AND NEW.publicar_en <= now() AND NEW.notificado_at IS NULL THEN
    NEW.notificado_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcar_comunicacion_notificada ON comunicaciones;
CREATE TRIGGER trg_marcar_comunicacion_notificada
  BEFORE INSERT OR UPDATE ON comunicaciones
  FOR EACH ROW EXECUTE FUNCTION marcar_comunicacion_notificada();

-- =============================================
-- AFTER: crear notificaciones a los destinatarios al publicarse
-- =============================================
CREATE OR REPLACE FUNCTION notificar_comunicacion_publicada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.publicado AND NEW.publicar_en <= now()
     AND (TG_OP = 'INSERT' OR OLD.notificado_at IS NULL) THEN
    INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
    SELECT
      p.id,
      'comunicacion',
      NEW.titulo,
      LEFT(NEW.cuerpo, 140),
      '/portal/comunicaciones/' || NEW.id
    FROM profiles p
    WHERE COALESCE(p.active, true) = true
      AND p.id <> NEW.creado_por
      AND (
        NEW.destinatarios_roles IS NULL
        OR p.role::text = ANY (NEW.destinatarios_roles)
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_comunicacion_publicada ON comunicaciones;
CREATE TRIGGER trg_notificar_comunicacion_publicada
  AFTER INSERT OR UPDATE ON comunicaciones
  FOR EACH ROW EXECUTE FUNCTION notificar_comunicacion_publicada();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE comunicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicacion_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicacion_lecturas ENABLE ROW LEVEL SECURITY;

-- Comunicaciones: admin ve todo; el resto sólo las publicadas, vencidas y
-- dirigidas a su rol. Escritura sólo admin.
DROP POLICY IF EXISTS "comunicaciones_read" ON comunicaciones;
CREATE POLICY "comunicaciones_read"
  ON comunicaciones FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (
      publicado = true
      AND publicar_en <= now()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND (
            comunicaciones.destinatarios_roles IS NULL
            OR p.role::text = ANY (comunicaciones.destinatarios_roles)
          )
      )
    )
  );

DROP POLICY IF EXISTS "comunicaciones_insert" ON comunicaciones;
CREATE POLICY "comunicaciones_insert"
  ON comunicaciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "comunicaciones_update" ON comunicaciones;
CREATE POLICY "comunicaciones_update"
  ON comunicaciones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "comunicaciones_delete" ON comunicaciones;
CREATE POLICY "comunicaciones_delete"
  ON comunicaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Adjuntos: lectura para quien puede ver la comunicación; escritura sólo admin.
DROP POLICY IF EXISTS "comunicacion_adjuntos_read" ON comunicacion_adjuntos;
CREATE POLICY "comunicacion_adjuntos_read"
  ON comunicacion_adjuntos FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM comunicaciones c WHERE c.id = comunicacion_adjuntos.comunicacion_id)
  );

DROP POLICY IF EXISTS "comunicacion_adjuntos_insert" ON comunicacion_adjuntos;
CREATE POLICY "comunicacion_adjuntos_insert"
  ON comunicacion_adjuntos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "comunicacion_adjuntos_delete" ON comunicacion_adjuntos;
CREATE POLICY "comunicacion_adjuntos_delete"
  ON comunicacion_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Lecturas: cada usuario gestiona la suya; admin las lee todas (para % lectura).
DROP POLICY IF EXISTS "comunicacion_lecturas_read" ON comunicacion_lecturas;
CREATE POLICY "comunicacion_lecturas_read"
  ON comunicacion_lecturas FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "comunicacion_lecturas_insert" ON comunicacion_lecturas;
CREATE POLICY "comunicacion_lecturas_insert"
  ON comunicacion_lecturas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comunicacion_lecturas_delete" ON comunicacion_lecturas;
CREATE POLICY "comunicacion_lecturas_delete"
  ON comunicacion_lecturas FOR DELETE TO authenticated
  USING (user_id = auth.uid());
