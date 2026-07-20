-- =============================================
-- Reunión Pre-Ruta  ->  asistencia en Reunión Matinal de Distribución
--
-- Los operarios marcan su check-in en `reunion_preruta` (por legajo).
-- El módulo de reuniones lleva la asistencia en `reuniones_asistentes`
-- (por profile_id). Hasta ahora eran dos registros paralelos sin ninguna
-- relación: la matinal quedaba siempre vacía.
--
-- Puente: reunion_preruta.legajo -> empleados.legajo -> empleados.profile_id
-- =============================================


-- ---------------------------------------------
-- 1) Origen del registro de asistencia
-- ---------------------------------------------
ALTER TABLE reuniones_asistentes
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reuniones_asistentes_origen_check'
  ) THEN
    ALTER TABLE reuniones_asistentes
      ADD CONSTRAINT reuniones_asistentes_origen_check
      CHECK (origen IN ('manual','preruta'));
  END IF;
END $$;

COMMENT ON COLUMN reuniones_asistentes.origen IS
  'manual = tildado por un editor o por el propio participante; '
  'preruta = derivado automáticamente del check-in en reunion_preruta';


-- ---------------------------------------------
-- 2) Sincronización de una fecha (idempotente)
--
-- La usan por igual el trigger de runtime y el backfill histórico, para
-- que ambos produzcan exactamente el mismo resultado.
--
-- SECURITY DEFINER: quien hace el check-in es un operario sin permiso de
-- escritura sobre reuniones/reuniones_asistentes (RLS deja escribir sólo a
-- admin|supervisor|admin_rrhh). El trigger tiene que poder igual.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION sync_preruta_a_matinal(p_fecha date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reunion_id  uuid;
  v_afectados   integer;
BEGIN
  -- Sin check-ins ese día no hay nada que sincronizar (no inventamos reuniones vacías)
  IF NOT EXISTS (SELECT 1 FROM reunion_preruta WHERE fecha = p_fecha) THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_reunion_id
  FROM reuniones
  WHERE tipo = 'matinal-distribucion' AND fecha = p_fecha;

  -- Si nadie creó la reunión de ese día, la creamos: hubo check-ins, hubo reunión.
  -- hora_inicio = primer check-in del día, en hora local AR.
  IF v_reunion_id IS NULL THEN
    INSERT INTO reuniones (tipo, fecha, hora_inicio, notas)
    SELECT
      'matinal-distribucion',
      p_fecha,
      (MIN(hora_checkin) AT TIME ZONE 'America/Argentina/Buenos_Aires')::time,
      'Reunión generada automáticamente a partir de los check-in de Reunión Pre-Ruta.'
    FROM reunion_preruta
    WHERE fecha = p_fecha
    ON CONFLICT (tipo, fecha) DO NOTHING
    RETURNING id INTO v_reunion_id;

    -- Carrera con el cron diario: si otro la insertó primero, la leemos
    IF v_reunion_id IS NULL THEN
      SELECT id INTO v_reunion_id
      FROM reuniones
      WHERE tipo = 'matinal-distribucion' AND fecha = p_fecha;
    END IF;
  END IF;

  -- Un asistente presente por cada legajo que hizo check-in y tiene profile.
  -- Los legajos sin empleados.profile_id no se pueden atribuir y se omiten.
  INSERT INTO reuniones_asistentes (reunion_id, profile_id, presente, origen)
  SELECT DISTINCT v_reunion_id, e.profile_id, true, 'preruta'
  FROM reunion_preruta rp
  JOIN empleados e ON e.legajo = rp.legajo
  WHERE rp.fecha = p_fecha
    AND e.profile_id IS NOT NULL
  ON CONFLICT (reunion_id, profile_id) DO UPDATE
    SET presente      = true,
        justificacion = NULL,
        -- Una marca manual previa conserva su origen: el check-in confirma
        -- la presencia, no reescribe quién la registró.
        origen        = CASE WHEN reuniones_asistentes.presente
                             THEN reuniones_asistentes.origen
                             ELSE 'preruta' END
    WHERE reuniones_asistentes.presente IS DISTINCT FROM true
       OR reuniones_asistentes.justificacion IS NOT NULL;

  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  RETURN v_afectados;
END $$;

COMMENT ON FUNCTION sync_preruta_a_matinal(date) IS
  'Vuelca los check-in de reunion_preruta de una fecha como asistentes presentes '
  'de la reunión matinal-distribucion de ese día, creándola si no existe. Idempotente.';


-- ---------------------------------------------
-- 3) Trigger: cada check-in impacta al instante
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION trg_preruta_sync_matinal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM sync_preruta_a_matinal(NEW.fecha);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS preruta_sync_matinal ON reunion_preruta;
CREATE TRIGGER preruta_sync_matinal
  AFTER INSERT ON reunion_preruta
  FOR EACH ROW
  EXECUTE FUNCTION trg_preruta_sync_matinal();


-- ---------------------------------------------
-- 4) Backfill histórico
-- ---------------------------------------------
DO $$
DECLARE
  f            date;
  v_dias       integer := 0;
  v_asistentes integer := 0;
BEGIN
  FOR f IN SELECT DISTINCT fecha FROM reunion_preruta ORDER BY fecha LOOP
    v_asistentes := v_asistentes + sync_preruta_a_matinal(f);
    v_dias := v_dias + 1;
  END LOOP;
  RAISE NOTICE 'Backfill pre-ruta -> matinal: % días procesados, % asistentes impactados', v_dias, v_asistentes;
END $$;
