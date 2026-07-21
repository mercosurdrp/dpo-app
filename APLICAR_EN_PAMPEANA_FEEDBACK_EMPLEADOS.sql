-- =============================================
-- Feedback de empleados → matinal del día siguiente
--
-- Canal ascendente: cualquier empleado (distribución, depósito, promotores)
-- reporta algo desde la app y el tema aparece SOLO en la matinal siguiente,
-- donde se trata y se cierra.
--
-- Cubre el punto DPO Entrega 2.2 "Feedback", hoy en 0 por no existir canal
-- digital: /portal/comunicaciones tiene 0 registros y no llega a ninguna
-- reunión. Acá lo que importa es que el ciclo CIERRE (se trata y se responde),
-- no sólo que el feedback se cargue.
--
-- Patrón calcado de roturas_calle (141) + portal_comunicaciones (102).
-- Solo Pampeana.
-- =============================================

BEGIN;

-- =============================================
-- Enums
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_categoria') THEN
    CREATE TYPE feedback_categoria AS ENUM (
      'seguridad',   -- riesgo en PDV, en ruta o en el CD
      'cliente',     -- problema con un cliente o su recepción
      'vehiculo',    -- camión, autoelevador, equipamiento
      'proceso',     -- carga, ruteo, liquidación, sistema
      'otro'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_criticidad') THEN
    CREATE TYPE feedback_criticidad AS ENUM ('baja', 'media', 'alta');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_estado') THEN
    -- nuevo → tratado en la matinal → (si hizo falta) con acción → cerrado
    CREATE TYPE feedback_estado AS ENUM ('nuevo', 'tratado', 'con_accion', 'cerrado');
  END IF;
END $$;

-- =============================================
-- Cabecera
-- =============================================
CREATE SEQUENCE IF NOT EXISTS feedback_empleado_numero_seq;

CREATE TABLE IF NOT EXISTS feedback_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGINT NOT NULL DEFAULT nextval('feedback_empleado_numero_seq'),
  -- Fecha del hecho (la elige el empleado; por defecto hoy). La matinal
  -- levanta por created_at, no por esta, para que nada quede colgado.
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria feedback_categoria NOT NULL,
  criticidad feedback_criticidad NOT NULL DEFAULT 'media',
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  -- Siempre identificado (decisión de negocio 2026-07-21): queda el autor y,
  -- desnormalizados, nombre y sector al momento de reportar — así el histórico
  -- no se rompe si la persona cambia de sector o se da de baja.
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  empleado_nombre TEXT,
  sector TEXT,
  -- Reunión donde se trató. La sección de la matinal lo sella al marcarlo.
  reunion_id UUID REFERENCES reuniones(id) ON DELETE SET NULL,
  -- Actividad del action log de la reunión, si el tema derivó en un compromiso.
  actividad_id UUID REFERENCES reuniones_actividades(id) ON DELETE SET NULL,
  estado feedback_estado NOT NULL DEFAULT 'nuevo',
  respuesta TEXT,               -- lo que se le contesta al empleado
  tratado_at TIMESTAMPTZ,
  cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_empleados_created_at ON feedback_empleados(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_empleados_estado ON feedback_empleados(estado);
CREATE INDEX IF NOT EXISTS idx_feedback_empleados_creado_por ON feedback_empleados(creado_por);
CREATE INDEX IF NOT EXISTS idx_feedback_empleados_reunion ON feedback_empleados(reunion_id);
-- El pendiente de la matinal es "estado = nuevo ordenado por criticidad".
CREATE INDEX IF NOT EXISTS idx_feedback_empleados_pendientes
  ON feedback_empleados(created_at DESC) WHERE estado = 'nuevo';

DROP TRIGGER IF EXISTS trg_feedback_empleados_updated_at ON feedback_empleados;
CREATE TRIGGER trg_feedback_empleados_updated_at
  BEFORE UPDATE ON feedback_empleados
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Adjuntos (foto del PDV, del bulto, del camión)
-- =============================================
CREATE TABLE IF NOT EXISTS feedback_empleados_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES feedback_empleados(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  nombre_original TEXT,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_empleados_adjuntos_fb
  ON feedback_empleados_adjuntos(feedback_id);

-- =============================================
-- Storage (público, igual que roturas-calle: se sirve con getPublicUrl)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-empleados', 'feedback-empleados', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "feedback_empleados_storage_read" ON storage.objects;
CREATE POLICY "feedback_empleados_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-empleados');

DROP POLICY IF EXISTS "feedback_empleados_storage_insert" ON storage.objects;
CREATE POLICY "feedback_empleados_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback-empleados');

DROP POLICY IF EXISTS "feedback_empleados_storage_delete" ON storage.objects;
CREATE POLICY "feedback_empleados_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'feedback-empleados'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- =============================================
-- Notificaciones (campanita) — calcado de notificar_nueva_comunicacion()
-- =============================================
CREATE OR REPLACE FUNCTION notificar_nuevo_feedback_empleado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  SELECT p.id, 'feedback',
         'Feedback #' || NEW.numero || ' · ' || COALESCE(NEW.empleado_nombre, 'empleado'),
         LEFT(NEW.titulo, 140),
         '/feedback-empleados'
  FROM profiles p
  WHERE p.role IN ('admin', 'supervisor')
    AND COALESCE(p.active, true) = true
    AND p.id <> NEW.creado_por;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_nuevo_feedback_empleado ON feedback_empleados;
CREATE TRIGGER trg_notificar_nuevo_feedback_empleado
  AFTER INSERT ON feedback_empleados
  FOR EACH ROW EXECUTE FUNCTION notificar_nuevo_feedback_empleado();

-- Al responder/cerrar: avisarle al empleado. Sin esto el canal se muere:
-- el que reporta y nunca sabe qué pasó, no vuelve a reportar.
CREATE OR REPLACE FUNCTION feedback_empleado_on_estado_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'tratado' AND NEW.tratado_at IS NULL THEN
      NEW.tratado_at := now();
    END IF;
    IF NEW.estado = 'cerrado' AND NEW.cerrado_at IS NULL THEN
      NEW.cerrado_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_empleado_sellar_fechas ON feedback_empleados;
CREATE TRIGGER trg_feedback_empleado_sellar_fechas
  BEFORE UPDATE ON feedback_empleados
  FOR EACH ROW EXECUTE FUNCTION feedback_empleado_on_estado_change();

CREATE OR REPLACE FUNCTION notificar_feedback_empleado_respondido()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NEW.estado IN ('tratado', 'con_accion', 'cerrado')
     AND NEW.creado_por <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
    VALUES (
      NEW.creado_por, 'feedback',
      'Tu feedback #' || NEW.numero || ' se trató en la matinal',
      COALESCE(LEFT(NEW.respuesta, 140), 'Nuevo estado: ' || NEW.estado),
      '/mi-feedback'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_feedback_empleado_respondido ON feedback_empleados;
CREATE TRIGGER trg_notificar_feedback_empleado_respondido
  AFTER UPDATE ON feedback_empleados
  FOR EACH ROW EXECUTE FUNCTION notificar_feedback_empleado_respondido();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE feedback_empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_empleados_adjuntos ENABLE ROW LEVEL SECURITY;

-- Lectura: el autor ve lo suyo; admin/supervisor ven todo.
-- (No es lectura abierta como roturas_calle: el feedback puede nombrar a un
-- compañero o a un supervisor, y que lo lea toda la empresa mata el canal.)
DROP POLICY IF EXISTS "feedback_empleados_read" ON feedback_empleados;
CREATE POLICY "feedback_empleados_read" ON feedback_empleados FOR SELECT TO authenticated
  USING (
    creado_por = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
               AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "feedback_empleados_insert" ON feedback_empleados;
CREATE POLICY "feedback_empleados_insert" ON feedback_empleados FOR INSERT TO authenticated
  WITH CHECK (creado_por = (select auth.uid()));

-- Update: sólo gestión. El empleado no edita lo que ya mandó (trazabilidad).
DROP POLICY IF EXISTS "feedback_empleados_update" ON feedback_empleados;
CREATE POLICY "feedback_empleados_update" ON feedback_empleados FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "feedback_empleados_delete" ON feedback_empleados;
CREATE POLICY "feedback_empleados_delete" ON feedback_empleados FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

DROP POLICY IF EXISTS "feedback_empleados_adjuntos_read" ON feedback_empleados_adjuntos;
CREATE POLICY "feedback_empleados_adjuntos_read"
  ON feedback_empleados_adjuntos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feedback_empleados f
      WHERE f.id = feedback_empleados_adjuntos.feedback_id
        AND (
          f.creado_por = (select auth.uid())
          OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid())
                     AND role IN ('admin', 'supervisor', 'admin_rrhh'))
        )
    )
  );

DROP POLICY IF EXISTS "feedback_empleados_adjuntos_insert" ON feedback_empleados_adjuntos;
CREATE POLICY "feedback_empleados_adjuntos_insert"
  ON feedback_empleados_adjuntos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feedback_empleados f
      WHERE f.id = feedback_empleados_adjuntos.feedback_id
        AND f.creado_por = (select auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

DROP POLICY IF EXISTS "feedback_empleados_adjuntos_delete" ON feedback_empleados_adjuntos;
CREATE POLICY "feedback_empleados_adjuntos_delete"
  ON feedback_empleados_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

GRANT ALL ON feedback_empleados TO anon, authenticated, service_role;
GRANT ALL ON feedback_empleados_adjuntos TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE feedback_empleado_numero_seq TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
