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
