-- =============================================
-- 038 · RRHH: catálogo de licencias, saldos de vacaciones y workflow de solicitudes
-- =============================================
-- Doble aprobación: empleado → supervisor → admin_rrhh.
-- Al aprobar RRHH, se insertan filas en asistencia_novedades (existente)
-- para que el módulo de asistencia diaria refleje los días.
-- =============================================

BEGIN;

-- Catálogo configurable de tipos de licencia.
CREATE TABLE IF NOT EXISTS rrhh_tipos_licencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,            -- 'VAC', 'ENF', 'EST', 'MAT', 'PAT', etc.
  nombre TEXT NOT NULL,
  descripcion TEXT,
  computa_dias_anuales BOOLEAN NOT NULL DEFAULT false,
  requiere_certificado BOOLEAN NOT NULL DEFAULT false,
  -- Valor a guardar en asistencia_novedades.tipo (vacaciones | licencia_medica | ausente | pergamino).
  novedad_asistencia_tipo TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN rrhh_tipos_licencia.novedad_asistencia_tipo IS
  'Tipo a usar al insertar en asistencia_novedades cuando se aprueba la solicitud';

-- Saldo de días de vacaciones por empleado y año.
CREATE TABLE IF NOT EXISTS rrhh_saldos_vacaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  dias_otorgados INT NOT NULL,
  dias_usados INT NOT NULL DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(empleado_id, anio)
);

CREATE INDEX IF NOT EXISTS idx_saldos_vacaciones_empleado_anio
  ON rrhh_saldos_vacaciones(empleado_id, anio);

-- Estado del workflow de solicitudes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rrhh_solicitud_estado') THEN
    CREATE TYPE rrhh_solicitud_estado AS ENUM (
      'pendiente_supervisor',
      'pendiente_rrhh',
      'aprobada',
      'rechazada',
      'cancelada'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rrhh_solicitudes_licencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  tipo_licencia_id UUID NOT NULL REFERENCES rrhh_tipos_licencia(id),
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  dias_solicitados INT NOT NULL,
  motivo TEXT,
  certificado_path TEXT,                  -- storage path en bucket rrhh-certificados
  estado rrhh_solicitud_estado NOT NULL DEFAULT 'pendiente_supervisor',

  -- Snapshot del supervisor al momento de crear (puede cambiar después).
  supervisor_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  supervisor_decision_at TIMESTAMPTZ,
  supervisor_observacion TEXT,

  -- Quién resolvió en RRHH.
  rrhh_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rrhh_decision_at TIMESTAMPTZ,
  rrhh_observacion TEXT,

  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (fecha_hasta >= fecha_desde),
  CHECK (dias_solicitados > 0)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_empleado ON rrhh_solicitudes_licencia(empleado_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON rrhh_solicitudes_licencia(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_supervisor ON rrhh_solicitudes_licencia(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha_desde ON rrhh_solicitudes_licencia(fecha_desde);

-- Trigger updated_at (reusa función update_updated_at() ya creada en migraciones anteriores).
DROP TRIGGER IF EXISTS trg_rrhh_solicitudes_updated_at ON rrhh_solicitudes_licencia;
CREATE TRIGGER trg_rrhh_solicitudes_updated_at
  BEFORE UPDATE ON rrhh_solicitudes_licencia
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_rrhh_saldos_updated_at ON rrhh_saldos_vacaciones;
CREATE TRIGGER trg_rrhh_saldos_updated_at
  BEFORE UPDATE ON rrhh_saldos_vacaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Storage bucket: rrhh-certificados (privado por ahora; lectura sólo authenticated)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('rrhh-certificados', 'rrhh-certificados', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "rrhh_certificados_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rrhh-certificados');

CREATE POLICY "rrhh_certificados_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rrhh-certificados');

CREATE POLICY "rrhh_certificados_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rrhh-certificados'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'admin_rrhh')
    )
  );

-- =============================================
-- Notificaciones del workflow
-- =============================================

-- Cuando se crea una solicitud, notifica al supervisor + admin_rrhh.
CREATE OR REPLACE FUNCTION notificar_nueva_solicitud_licencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empleado_nombre TEXT;
  v_supervisor_profile_id UUID;
BEGIN
  SELECT nombre INTO v_empleado_nombre FROM empleados WHERE id = NEW.empleado_id;

  -- Profile del supervisor (si tiene profile linkeado).
  SELECT p.id INTO v_supervisor_profile_id
  FROM profiles p
  WHERE p.empleado_id = NEW.supervisor_id
  LIMIT 1;

  -- Notificar al supervisor (si existe profile).
  IF v_supervisor_profile_id IS NOT NULL THEN
    INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
    VALUES (
      v_supervisor_profile_id,
      'rrhh_solicitud_licencia',
      'Nueva solicitud de ' || COALESCE(v_empleado_nombre, 'empleado'),
      'Solicita licencia del ' || NEW.fecha_desde || ' al ' || NEW.fecha_hasta,
      '/rrhh/mi-equipo'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_nueva_solicitud_licencia ON rrhh_solicitudes_licencia;
CREATE TRIGGER trg_notificar_nueva_solicitud_licencia
  AFTER INSERT ON rrhh_solicitudes_licencia
  FOR EACH ROW EXECUTE FUNCTION notificar_nueva_solicitud_licencia();

-- Cuando cambia de estado, notificar a las partes interesadas.
CREATE OR REPLACE FUNCTION notificar_cambio_estado_solicitud()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empleado_profile_id UUID;
  v_admin_rrhh_id UUID;
BEGIN
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;

  -- Profile del empleado solicitante.
  SELECT p.id INTO v_empleado_profile_id
  FROM profiles p
  WHERE p.empleado_id = NEW.empleado_id
  LIMIT 1;

  -- Si pasa a pendiente_rrhh: notificar a admin_rrhh y admin.
  IF NEW.estado = 'pendiente_rrhh' THEN
    INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
    SELECT
      p.id,
      'rrhh_solicitud_licencia',
      'Solicitud lista para validar',
      'Supervisor aprobó. Pendiente de validación de RRHH.',
      '/rrhh/licencias'
    FROM profiles p
    WHERE p.role IN ('admin', 'admin_rrhh') AND COALESCE(p.active, true) = true;
  END IF;

  -- Si se aprueba o rechaza: notificar al empleado.
  IF NEW.estado IN ('aprobada', 'rechazada') AND v_empleado_profile_id IS NOT NULL THEN
    INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
    VALUES (
      v_empleado_profile_id,
      'rrhh_solicitud_licencia',
      CASE NEW.estado
        WHEN 'aprobada' THEN 'Tu solicitud fue aprobada'
        WHEN 'rechazada' THEN 'Tu solicitud fue rechazada'
      END,
      'Del ' || NEW.fecha_desde || ' al ' || NEW.fecha_hasta,
      '/rrhh/mis-solicitudes'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_cambio_estado_solicitud ON rrhh_solicitudes_licencia;
CREATE TRIGGER trg_notificar_cambio_estado_solicitud
  AFTER UPDATE ON rrhh_solicitudes_licencia
  FOR EACH ROW EXECUTE FUNCTION notificar_cambio_estado_solicitud();

-- =============================================
-- Trigger: al aprobar (estado='aprobada'), inserta en asistencia_novedades
-- los días afectados, mapeando tipo_licencia → tipo de novedad.
-- =============================================
CREATE OR REPLACE FUNCTION rrhh_solicitud_aprobada_a_novedades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empleado_legajo INT;
  v_novedad_tipo TEXT;
  v_dia DATE;
BEGIN
  IF NEW.estado <> 'aprobada' OR OLD.estado = 'aprobada' THEN
    RETURN NEW;
  END IF;

  SELECT legajo INTO v_empleado_legajo FROM empleados WHERE id = NEW.empleado_id;
  SELECT novedad_asistencia_tipo INTO v_novedad_tipo
    FROM rrhh_tipos_licencia WHERE id = NEW.tipo_licencia_id;

  IF v_empleado_legajo IS NULL OR v_novedad_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  v_dia := NEW.fecha_desde;
  WHILE v_dia <= NEW.fecha_hasta LOOP
    INSERT INTO asistencia_novedades (legajo, fecha, tipo, observaciones)
    VALUES (
      v_empleado_legajo,
      v_dia,
      v_novedad_tipo,
      'Solicitud RRHH ' || NEW.id::text
    )
    ON CONFLICT (legajo, fecha) DO UPDATE
      SET tipo = EXCLUDED.tipo,
          observaciones = EXCLUDED.observaciones;
    v_dia := v_dia + INTERVAL '1 day';
  END LOOP;

  -- Descontar saldo si computa días anuales (vacaciones).
  UPDATE rrhh_saldos_vacaciones s
  SET dias_usados = dias_usados + NEW.dias_solicitados
  FROM rrhh_tipos_licencia t
  WHERE s.empleado_id = NEW.empleado_id
    AND s.anio = EXTRACT(YEAR FROM NEW.fecha_desde)::INT
    AND t.id = NEW.tipo_licencia_id
    AND t.computa_dias_anuales = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rrhh_solicitud_aprobada_a_novedades ON rrhh_solicitudes_licencia;
CREATE TRIGGER trg_rrhh_solicitud_aprobada_a_novedades
  AFTER UPDATE ON rrhh_solicitudes_licencia
  FOR EACH ROW EXECUTE FUNCTION rrhh_solicitud_aprobada_a_novedades();

-- =============================================
-- Seed inicial de tipos de licencia (idempotente).
-- =============================================
INSERT INTO rrhh_tipos_licencia (codigo, nombre, computa_dias_anuales, requiere_certificado, novedad_asistencia_tipo)
VALUES
  ('VAC', 'Vacaciones', true,  false, 'vacaciones'),
  ('ENF', 'Licencia médica', false, true,  'licencia_medica'),
  ('EST', 'Licencia por estudio', false, true,  'ausente'),
  ('MAT', 'Licencia por maternidad', false, true,  'ausente'),
  ('PAT', 'Licencia por paternidad', false, false, 'ausente'),
  ('FAM', 'Licencia familiar', false, false, 'ausente')
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
