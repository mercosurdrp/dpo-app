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
