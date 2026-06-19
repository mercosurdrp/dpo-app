-- =============================================
-- 138 · Notificaciones de tareas (al asignar + vencimientos)
-- =============================================
-- Canal: campana in-app (reusa tabla notificaciones). Sin emails.
--
-- Cubre los módulos cuyo responsable es un usuario real (profiles):
--   · requisitos_legales        (responsable_id)         -> /requisitos-legales
--   · plan_responsables         (profile_id)             -> /planes/<id>
--       (cubre planes de auditoría y tareas directas: ambos son planes_accion)
--   · s5_acciones               (responsable_id)         -> /5s/acciones
--   · presupuestos_tareas       (responsable_id)         -> /presupuesto
--
-- Eventos:
--   a) "al asignar"  -> triggers de este archivo (inmediato).
--   b) "por vencer / vence hoy / vencido" -> cron diario
--      /api/tareas/cron-vencimientos (usa tareas_alertas_log para idempotencia).
--
-- Quedan FUERA (no hay usuario destinatario): TML (responsable es texto libre)
-- y planes de reportes de seguridad (sin campo responsable).
--
-- Idempotente.
-- =============================================

BEGIN;

-- ---------------------------------------------
-- Helper: inserta una notificación solo si el destinatario existe, está
-- activo y no es quien hizo la asignación (no auto-notificar).
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION notif_crear_si_activo(
  p_user_id  uuid,
  p_excluir  uuid,
  p_tipo     text,
  p_titulo   text,
  p_mensaje  text,
  p_link     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  IF p_excluir IS NOT NULL AND p_user_id = p_excluir THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND COALESCE(active, true) = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  VALUES (p_user_id, p_tipo, p_titulo, p_mensaje, p_link);
END;
$$;

-- =============================================
-- a) Requisitos legales: al asignar responsable
-- =============================================
CREATE OR REPLACE FUNCTION notif_requisito_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- En UPDATE, solo si el responsable cambió realmente.
  IF TG_OP = 'UPDATE'
     AND NEW.responsable_id IS NOT DISTINCT FROM OLD.responsable_id THEN
    RETURN NEW;
  END IF;

  PERFORM notif_crear_si_activo(
    NEW.responsable_id,
    auth.uid(),
    'tarea_asignada',
    'Te asignaron un requisito legal',
    NEW.nombre
      || COALESCE(' · vence ' || to_char(NEW.fecha_vencimiento, 'DD/MM/YYYY'), ''),
    '/requisitos-legales'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_requisito_asignado ON requisitos_legales;
CREATE TRIGGER trg_notif_requisito_asignado
  AFTER INSERT OR UPDATE OF responsable_id ON requisitos_legales
  FOR EACH ROW EXECUTE FUNCTION notif_requisito_asignado();

-- =============================================
-- b) Planes de acción / tareas directas: al asignar responsable
--    (se asigna en plan_responsables; cubre ambos tipos de plan)
-- =============================================
CREATE OR REPLACE FUNCTION notif_plan_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo_plan TEXT;
  v_descripcion TEXT;
  v_fecha_limite DATE;
  v_tipo TEXT;
BEGIN
  SELECT titulo, descripcion, fecha_limite, tipo::text
    INTO v_titulo_plan, v_descripcion, v_fecha_limite, v_tipo
  FROM planes_accion
  WHERE id = NEW.plan_id;

  PERFORM notif_crear_si_activo(
    NEW.profile_id,
    NEW.asignado_por,
    'tarea_asignada',
    CASE WHEN v_tipo = 'directa'
         THEN 'Te asignaron una tarea'
         ELSE 'Te asignaron un plan de acción' END,
    COALESCE(NULLIF(v_titulo_plan, ''), LEFT(v_descripcion, 80))
      || COALESCE(' · vence ' || to_char(v_fecha_limite, 'DD/MM/YYYY'), ''),
    '/planes/' || NEW.plan_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_plan_asignado ON plan_responsables;
CREATE TRIGGER trg_notif_plan_asignado
  AFTER INSERT ON plan_responsables
  FOR EACH ROW EXECUTE FUNCTION notif_plan_asignado();

-- =============================================
-- c) Acciones 5S: al asignar responsable
-- =============================================
CREATE OR REPLACE FUNCTION notif_s5_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.responsable_id IS NOT DISTINCT FROM OLD.responsable_id THEN
    RETURN NEW;
  END IF;

  PERFORM notif_crear_si_activo(
    NEW.responsable_id,
    auth.uid(),
    'tarea_asignada',
    'Te asignaron una acción 5S',
    LEFT(NEW.descripcion, 120)
      || COALESCE(' · compromiso ' || to_char(NEW.fecha_compromiso, 'DD/MM/YYYY'), ''),
    '/5s/acciones'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_s5_asignado ON s5_acciones;
CREATE TRIGGER trg_notif_s5_asignado
  AFTER INSERT OR UPDATE OF responsable_id ON s5_acciones
  FOR EACH ROW EXECUTE FUNCTION notif_s5_asignado();

-- =============================================
-- d) Tareas de presupuesto: al asignar responsable
-- =============================================
CREATE OR REPLACE FUNCTION notif_presupuesto_tarea_asignada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.responsable_id IS NOT DISTINCT FROM OLD.responsable_id THEN
    RETURN NEW;
  END IF;

  PERFORM notif_crear_si_activo(
    NEW.responsable_id,
    auth.uid(),
    'tarea_asignada',
    'Te asignaron una tarea de presupuesto',
    COALESCE(NULLIF(LEFT(NEW.descripcion, 120), ''), NEW.rubro)
      || COALESCE(' · vence ' || to_char(NEW.fecha_limite, 'DD/MM/YYYY'), ''),
    '/presupuesto'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_presupuesto_tarea_asignada ON presupuestos_tareas;
CREATE TRIGGER trg_notif_presupuesto_tarea_asignada
  AFTER INSERT OR UPDATE OF responsable_id ON presupuestos_tareas
  FOR EACH ROW EXECUTE FUNCTION notif_presupuesto_tarea_asignada();

-- =============================================
-- e) Log de idempotencia para el cron de vencimientos
--    (un aviso por origen+tarea+usuario+día)
-- =============================================
CREATE TABLE IF NOT EXISTS tareas_alertas_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen          text NOT NULL,                 -- 'plan' | 's5' | 'presupuesto'
  tarea_id        uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fecha_enviada   date NOT NULL,
  dias_restantes  int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origen, tarea_id, user_id, fecha_enviada)
);

CREATE INDEX IF NOT EXISTS idx_tareas_alertas_log_lookup
  ON tareas_alertas_log (origen, tarea_id, user_id, fecha_enviada);

ALTER TABLE tareas_alertas_log ENABLE ROW LEVEL SECURITY;
-- Solo el service role (cron) escribe/lee; sin policies para authenticated.

COMMIT;

-- Recargar el schema cache de PostgREST (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
