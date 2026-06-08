-- =============================================================
-- APLICAR EN PAMPEANA: Portal del Empleado (Buzón + Servicios Generales)
-- Combina migraciones 100, 101, 102 y 103. Idempotente.
-- =============================================================

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

-- =============================================
-- Portal del Empleado · Servicios Generales (mesa de ayuda interna)
-- Tickets de infraestructura/mantenimiento con adjuntos, comentarios
-- (internos / visibles) e historial de estados. Notifica a admins al crear
-- y al creador en cada cambio de estado. Idempotente.
-- =============================================

-- =============================================
-- Enums
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sg_categoria') THEN
    CREATE TYPE sg_categoria AS ENUM (
      'edilicio',
      'electricidad',
      'iluminacion',
      'aire_acondicionado',
      'sanitarios',
      'mobiliario',
      'equipamiento',
      'limpieza',
      'seguridad_fisica',
      'otros'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sg_estado') THEN
    CREATE TYPE sg_estado AS ENUM (
      'abierto',
      'en_revision',
      'asignado',
      'en_proceso',
      'resuelto',
      'cerrado'
    );
  END IF;
END $$;

-- Número legible de ticket
CREATE SEQUENCE IF NOT EXISTS sg_ticket_numero_seq START 1;

-- =============================================
-- Tabla principal
-- =============================================
CREATE TABLE IF NOT EXISTS sg_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGINT NOT NULL DEFAULT nextval('sg_ticket_numero_seq'),
  categoria sg_categoria NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  sector TEXT,
  estado sg_estado NOT NULL DEFAULT 'abierto',
  asignado_a UUID REFERENCES profiles(id) ON DELETE SET NULL,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  resuelto_at TIMESTAMPTZ,
  cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sg_tickets_estado ON sg_tickets(estado);
CREATE INDEX IF NOT EXISTS idx_sg_tickets_creado_por ON sg_tickets(creado_por);
CREATE INDEX IF NOT EXISTS idx_sg_tickets_asignado_a ON sg_tickets(asignado_a);
CREATE INDEX IF NOT EXISTS idx_sg_tickets_created_at ON sg_tickets(created_at DESC);

-- =============================================
-- Adjuntos (es_evidencia = false → imagen del empleado; true → evidencia admin)
-- =============================================
CREATE TABLE IF NOT EXISTS sg_ticket_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES sg_tickets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  es_evidencia BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sg_ticket_adjuntos_ticket ON sg_ticket_adjuntos(ticket_id);

-- =============================================
-- Comentarios (interno = true → sólo admin)
-- =============================================
CREATE TABLE IF NOT EXISTS sg_ticket_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES sg_tickets(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  interno BOOLEAN NOT NULL DEFAULT false,
  autor UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sg_ticket_comentarios_ticket ON sg_ticket_comentarios(ticket_id);

-- =============================================
-- Historial de estados (seguimiento de avances)
-- =============================================
CREATE TABLE IF NOT EXISTS sg_ticket_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES sg_tickets(id) ON DELETE CASCADE,
  estado_anterior sg_estado,
  estado_nuevo sg_estado NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sg_ticket_historial_ticket ON sg_ticket_historial(ticket_id, changed_at);

-- =============================================
-- Storage bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-servicios', 'portal-servicios', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "portal_servicios_storage_read" ON storage.objects;
CREATE POLICY "portal_servicios_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'portal-servicios');

DROP POLICY IF EXISTS "portal_servicios_storage_insert" ON storage.objects;
CREATE POLICY "portal_servicios_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'portal-servicios');

DROP POLICY IF EXISTS "portal_servicios_storage_delete" ON storage.objects;
CREATE POLICY "portal_servicios_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-servicios'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- Triggers
-- =============================================
DROP TRIGGER IF EXISTS trg_sg_tickets_updated_at ON sg_tickets;
CREATE TRIGGER trg_sg_tickets_updated_at
  BEFORE UPDATE ON sg_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- BEFORE UPDATE: sellar resuelto_at / cerrado_at según el estado.
CREATE OR REPLACE FUNCTION sg_ticket_sellar_fechas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'resuelto' AND NEW.resuelto_at IS NULL THEN
    NEW.resuelto_at := now();
  END IF;
  IF NEW.estado = 'cerrado' AND NEW.cerrado_at IS NULL THEN
    NEW.cerrado_at := now();
    IF NEW.resuelto_at IS NULL THEN
      NEW.resuelto_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sg_ticket_sellar_fechas ON sg_tickets;
CREATE TRIGGER trg_sg_ticket_sellar_fechas
  BEFORE UPDATE ON sg_tickets
  FOR EACH ROW EXECUTE FUNCTION sg_ticket_sellar_fechas();

-- AFTER INSERT: avisar a los admin de la nueva solicitud.
CREATE OR REPLACE FUNCTION notificar_nuevo_sg_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  SELECT
    p.id,
    'sg_ticket',
    'Nueva solicitud #' || NEW.numero || ' · Servicios Generales',
    LEFT(NEW.titulo, 140),
    '/portal/servicios/' || NEW.id
  FROM profiles p
  WHERE p.role = 'admin'
    AND COALESCE(p.active, true) = true
    AND p.id <> NEW.creado_por;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_nuevo_sg_ticket ON sg_tickets;
CREATE TRIGGER trg_notificar_nuevo_sg_ticket
  AFTER INSERT ON sg_tickets
  FOR EACH ROW EXECUTE FUNCTION notificar_nuevo_sg_ticket();

-- AFTER UPDATE: registrar historial + avisar al creador cuando cambia el estado.
CREATE OR REPLACE FUNCTION sg_ticket_on_estado_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO sg_ticket_historial (ticket_id, estado_anterior, estado_nuevo, changed_by)
    VALUES (NEW.id, OLD.estado, NEW.estado, auth.uid());

    IF NEW.creado_por <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
      VALUES (
        NEW.creado_por,
        'sg_ticket',
        'Tu solicitud #' || NEW.numero || ' cambió de estado',
        'Nuevo estado: ' || NEW.estado,
        '/portal/servicios/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sg_ticket_on_estado_change ON sg_tickets;
CREATE TRIGGER trg_sg_ticket_on_estado_change
  AFTER UPDATE ON sg_tickets
  FOR EACH ROW EXECUTE FUNCTION sg_ticket_on_estado_change();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE sg_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sg_ticket_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sg_ticket_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sg_ticket_historial ENABLE ROW LEVEL SECURITY;

-- Tickets: admin ve todos; el resto ve los propios o los que tiene asignados.
DROP POLICY IF EXISTS "sg_tickets_read" ON sg_tickets;
CREATE POLICY "sg_tickets_read"
  ON sg_tickets FOR SELECT TO authenticated
  USING (
    creado_por = auth.uid()
    OR asignado_a = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "sg_tickets_insert" ON sg_tickets;
CREATE POLICY "sg_tickets_insert"
  ON sg_tickets FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

DROP POLICY IF EXISTS "sg_tickets_update" ON sg_tickets;
CREATE POLICY "sg_tickets_update"
  ON sg_tickets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "sg_tickets_delete" ON sg_tickets;
CREATE POLICY "sg_tickets_delete"
  ON sg_tickets FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Helper inline: ¿puede el usuario ver este ticket?
-- (se repite la condición en las tablas hijas)
DROP POLICY IF EXISTS "sg_ticket_adjuntos_read" ON sg_ticket_adjuntos;
CREATE POLICY "sg_ticket_adjuntos_read"
  ON sg_ticket_adjuntos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sg_tickets t
      WHERE t.id = sg_ticket_adjuntos.ticket_id
        AND (
          t.creado_por = auth.uid()
          OR t.asignado_a = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "sg_ticket_adjuntos_insert" ON sg_ticket_adjuntos;
CREATE POLICY "sg_ticket_adjuntos_insert"
  ON sg_ticket_adjuntos FOR INSERT TO authenticated
  WITH CHECK (
    -- El creador puede adjuntar imágenes a su ticket; el admin, evidencias.
    EXISTS (
      SELECT 1 FROM sg_tickets t
      WHERE t.id = sg_ticket_adjuntos.ticket_id
        AND t.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "sg_ticket_adjuntos_delete" ON sg_ticket_adjuntos;
CREATE POLICY "sg_ticket_adjuntos_delete"
  ON sg_ticket_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Comentarios: admin ve todos; el creador ve los no-internos de sus tickets.
DROP POLICY IF EXISTS "sg_ticket_comentarios_read" ON sg_ticket_comentarios;
CREATE POLICY "sg_ticket_comentarios_read"
  ON sg_ticket_comentarios FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (
      interno = false
      AND EXISTS (
        SELECT 1 FROM sg_tickets t
        WHERE t.id = sg_ticket_comentarios.ticket_id
          AND (t.creado_por = auth.uid() OR t.asignado_a = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "sg_ticket_comentarios_insert" ON sg_ticket_comentarios;
CREATE POLICY "sg_ticket_comentarios_insert"
  ON sg_ticket_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    autor = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR (
        interno = false
        AND EXISTS (
          SELECT 1 FROM sg_tickets t
          WHERE t.id = sg_ticket_comentarios.ticket_id
            AND t.creado_por = auth.uid()
        )
      )
    )
  );

-- Historial: visible para quien ve el ticket. Inserta el trigger (SECURITY DEFINER).
DROP POLICY IF EXISTS "sg_ticket_historial_read" ON sg_ticket_historial;
CREATE POLICY "sg_ticket_historial_read"
  ON sg_ticket_historial FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sg_tickets t
      WHERE t.id = sg_ticket_historial.ticket_id
        AND (
          t.creado_por = auth.uid()
          OR t.asignado_a = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );

-- =============================================
-- Portal del Empleado · Buzón de Comunicaciones (rediseño a flujo ASCENDENTE)
-- El empleado sube comunicaciones y el admin las recibe y gestiona con estados
-- (abierta → en_revision → gestionada → cerrada), estilo mesa de entrada / ticket.
-- Reemplaza el flujo descendente (admin publica → empleados leen) de la 100.
-- Idempotente. Aplicar en Misiones y Pampeana.
-- =============================================

-- Estado de gestión
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comunicacion_estado') THEN
    CREATE TYPE comunicacion_estado AS ENUM ('abierta', 'en_revision', 'gestionada', 'cerrada');
  END IF;
END $$;

-- Numerador
CREATE SEQUENCE IF NOT EXISTS comunicacion_numero_seq START 1;

-- Nuevas columnas (las del flujo descendente quedan pero sin uso)
ALTER TABLE comunicaciones
  ADD COLUMN IF NOT EXISTS numero BIGINT,
  ADD COLUMN IF NOT EXISTS estado comunicacion_estado NOT NULL DEFAULT 'abierta',
  ADD COLUMN IF NOT EXISTS asignado_a UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gestionado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ;

-- Backfill de número para filas previas + default a futuro
UPDATE comunicaciones SET numero = nextval('comunicacion_numero_seq') WHERE numero IS NULL;
ALTER TABLE comunicaciones ALTER COLUMN numero SET DEFAULT nextval('comunicacion_numero_seq');
ALTER TABLE comunicaciones ALTER COLUMN numero SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comunicaciones_estado ON comunicaciones(estado);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_asignado_a ON comunicaciones(asignado_a);

-- =============================================
-- Comentarios (interno = sólo admin) e historial de estados
-- =============================================
CREATE TABLE IF NOT EXISTS comunicacion_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comunicacion_id UUID NOT NULL REFERENCES comunicaciones(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  interno BOOLEAN NOT NULL DEFAULT false,
  autor UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comunicacion_comentarios_com ON comunicacion_comentarios(comunicacion_id);

CREATE TABLE IF NOT EXISTS comunicacion_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comunicacion_id UUID NOT NULL REFERENCES comunicaciones(id) ON DELETE CASCADE,
  estado_anterior comunicacion_estado,
  estado_nuevo comunicacion_estado NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comunicacion_historial_com ON comunicacion_historial(comunicacion_id, changed_at);

-- =============================================
-- Quitar triggers del flujo descendente (publicación / notificación masiva)
-- =============================================
DROP TRIGGER IF EXISTS trg_marcar_comunicacion_notificada ON comunicaciones;
DROP TRIGGER IF EXISTS trg_notificar_comunicacion_publicada ON comunicaciones;
DROP FUNCTION IF EXISTS marcar_comunicacion_notificada();
DROP FUNCTION IF EXISTS notificar_comunicacion_publicada();

-- =============================================
-- Nuevos triggers (mesa de entrada ascendente)
-- =============================================
-- Sellar fechas de gestión según el estado.
CREATE OR REPLACE FUNCTION comunicacion_sellar_fechas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'gestionada' AND NEW.gestionado_at IS NULL THEN
    NEW.gestionado_at := now();
  END IF;
  IF NEW.estado = 'cerrada' AND NEW.cerrado_at IS NULL THEN
    NEW.cerrado_at := now();
    IF NEW.gestionado_at IS NULL THEN NEW.gestionado_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comunicacion_sellar_fechas ON comunicaciones;
CREATE TRIGGER trg_comunicacion_sellar_fechas BEFORE UPDATE ON comunicaciones
  FOR EACH ROW EXECUTE FUNCTION comunicacion_sellar_fechas();

-- Al crear: avisar a los admin de la nueva comunicación.
CREATE OR REPLACE FUNCTION notificar_nueva_comunicacion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  SELECT p.id, 'comunicacion', 'Nueva comunicación #' || NEW.numero || ' · ' || NEW.titulo,
         LEFT(NEW.cuerpo, 140), '/portal/comunicaciones/' || NEW.id
  FROM profiles p
  WHERE p.role = 'admin' AND COALESCE(p.active, true) = true AND p.id <> NEW.creado_por;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notificar_nueva_comunicacion ON comunicaciones;
CREATE TRIGGER trg_notificar_nueva_comunicacion AFTER INSERT ON comunicaciones
  FOR EACH ROW EXECUTE FUNCTION notificar_nueva_comunicacion();

-- Al cambiar estado: registrar historial + avisar al autor.
CREATE OR REPLACE FUNCTION comunicacion_on_estado_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO comunicacion_historial (comunicacion_id, estado_anterior, estado_nuevo, changed_by)
    VALUES (NEW.id, OLD.estado, NEW.estado, auth.uid());
    IF NEW.creado_por <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
      VALUES (NEW.creado_por, 'comunicacion', 'Tu comunicación #' || NEW.numero || ' cambió de estado',
              'Nuevo estado: ' || NEW.estado, '/portal/comunicaciones/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comunicacion_on_estado_change ON comunicaciones;
CREATE TRIGGER trg_comunicacion_on_estado_change AFTER UPDATE ON comunicaciones
  FOR EACH ROW EXECUTE FUNCTION comunicacion_on_estado_change();

-- =============================================
-- RLS: reemplazar las policies del flujo descendente
-- =============================================
DROP POLICY IF EXISTS "comunicaciones_read" ON comunicaciones;
CREATE POLICY "comunicaciones_read" ON comunicaciones FOR SELECT TO authenticated
  USING (
    creado_por = auth.uid()
    OR asignado_a = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "comunicaciones_insert" ON comunicaciones;
CREATE POLICY "comunicaciones_insert" ON comunicaciones FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

DROP POLICY IF EXISTS "comunicaciones_update" ON comunicaciones;
CREATE POLICY "comunicaciones_update" ON comunicaciones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "comunicaciones_delete" ON comunicaciones;
CREATE POLICY "comunicaciones_delete" ON comunicaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Adjuntos: el autor del comunicado puede adjuntar; lectura para quien lo ve.
DROP POLICY IF EXISTS "comunicacion_adjuntos_read" ON comunicacion_adjuntos;
CREATE POLICY "comunicacion_adjuntos_read" ON comunicacion_adjuntos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM comunicaciones c
      WHERE c.id = comunicacion_adjuntos.comunicacion_id
        AND (
          c.creado_por = auth.uid()
          OR c.asignado_a = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "comunicacion_adjuntos_insert" ON comunicacion_adjuntos;
CREATE POLICY "comunicacion_adjuntos_insert" ON comunicacion_adjuntos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM comunicaciones c
      WHERE c.id = comunicacion_adjuntos.comunicacion_id AND c.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- comunicacion_adjuntos_delete (sólo admin) ya existe de la 100; se mantiene.

-- Comentarios
ALTER TABLE comunicacion_comentarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comunicacion_comentarios_read" ON comunicacion_comentarios;
CREATE POLICY "comunicacion_comentarios_read" ON comunicacion_comentarios FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR (interno = false AND EXISTS (
      SELECT 1 FROM comunicaciones c WHERE c.id = comunicacion_comentarios.comunicacion_id
        AND (c.creado_por = auth.uid() OR c.asignado_a = auth.uid())
    ))
  );
DROP POLICY IF EXISTS "comunicacion_comentarios_insert" ON comunicacion_comentarios;
CREATE POLICY "comunicacion_comentarios_insert" ON comunicacion_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    autor = auth.uid() AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR (interno = false AND EXISTS (
        SELECT 1 FROM comunicaciones c WHERE c.id = comunicacion_comentarios.comunicacion_id
          AND c.creado_por = auth.uid()
      ))
    )
  );

-- Historial
ALTER TABLE comunicacion_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comunicacion_historial_read" ON comunicacion_historial;
CREATE POLICY "comunicacion_historial_read" ON comunicacion_historial FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM comunicaciones c WHERE c.id = comunicacion_historial.comunicacion_id
        AND (
          c.creado_por = auth.uid()
          OR c.asignado_a = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        )
    )
  );

-- =============================================
-- Portal del Empleado · Buzón: nueva categoría "Capacitaciones"
-- Idempotente (ADD VALUE IF NOT EXISTS). Aplicar en Misiones y Pampeana.
-- =============================================
ALTER TYPE comunicacion_categoria ADD VALUE IF NOT EXISTS 'capacitaciones';
