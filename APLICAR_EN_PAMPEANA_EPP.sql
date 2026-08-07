-- =============================================
-- Ropa y EPP: talles por empleado + entregas con confirmación
--
-- 1) empleados_talles: cada empleado carga sus talles (pantalón, remera,
--    campera, buzo, botines) desde /mi-ropa; RRHH los ve consolidados en
--    /rrhh/epp para saber cuánto comprar de cada talle.
-- 2) entregas_epp (+ items): RRHH registra qué se le entregó a quién.
--    El empleado CONFIRMA el recibo o lo RECLAMA (talle equivocado, faltó
--    un ítem); RRHH resuelve el reclamo. Sin confirmación el ciclo no
--    cierra, igual criterio que feedback_empleados.
--
-- Patrón calcado de feedback_empleados (20260721220000) + RLS canónica de
-- 040_rrhh_rls_policies. Ambos tenants (Pampeana y Misiones).
-- =============================================

-- =============================================
-- PRERREQUISITOS (copiados de 001 + 034 + 037, todos idempotentes):
-- roles supervisor/admin_rrhh, link profiles→empleados y helpers RLS.
-- Van en su PROPIA transacción: un valor nuevo de enum no se puede usar
-- en la misma transacción que lo agrega, y las policies de abajo usan
-- 'admin_rrhh'.
-- =============================================
BEGIN;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin_rrhh';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS empleado_id UUID REFERENCES empleados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_empleado_id
  ON profiles(empleado_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_empleado_id_unique
  ON profiles(empleado_id)
  WHERE empleado_id IS NOT NULL;

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES empleados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS departamento TEXT,
  ADD COLUMN IF NOT EXISTS puesto TEXT,
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE,
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT,
  ADD COLUMN IF NOT EXISTS cuil TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS email_personal TEXT;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sólo si no existen: en algún tenant ya hay un auth_role() con otro tipo
-- de retorno (p.ej. TEXT) y CREATE OR REPLACE no puede cambiarlo. Para las
-- policies de abajo cualquiera de las dos variantes sirve (la comparación
-- con 'admin' / 'admin_rrhh' funciona igual con TEXT o user_role).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'auth_empleado_id' AND n.nspname = 'public'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth_empleado_id()
      RETURNS UUID
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT empleado_id FROM profiles WHERE id = auth.uid();
      $body$;
    $fn$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'auth_role' AND n.nspname = 'public'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth_role()
      RETURNS user_role
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT role FROM profiles WHERE id = auth.uid();
      $body$;
    $fn$;
  END IF;
END
$do$;

COMMIT;

BEGIN;

-- =============================================
-- Enum de estados
-- =============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entrega_epp_estado') THEN
    -- pendiente → confirmada  (recibió conforme)
    --           → reclamada → resuelta  (RRHH contesta el reclamo)
    CREATE TYPE entrega_epp_estado AS ENUM ('pendiente', 'confirmada', 'reclamada', 'resuelta');
  END IF;
END $$;

-- =============================================
-- Talles (1:1 con empleados; tabla aparte para que el RLS del empleado
-- le deje editar SUS talles sin abrirle el resto de su ficha)
-- =============================================
CREATE TABLE IF NOT EXISTS empleados_talles (
  empleado_id UUID PRIMARY KEY REFERENCES empleados(id) ON DELETE CASCADE,
  talle_pantalon TEXT,
  talle_remera TEXT,
  talle_campera TEXT,
  talle_buzo TEXT,
  talle_botines TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_empleados_talles_updated_at ON empleados_talles;
CREATE TRIGGER trg_empleados_talles_updated_at
  BEFORE UPDATE ON empleados_talles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Entregas: cabecera
-- =============================================
CREATE SEQUENCE IF NOT EXISTS entrega_epp_numero_seq;

CREATE TABLE IF NOT EXISTS entregas_epp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGINT NOT NULL DEFAULT nextval('entrega_epp_numero_seq'),
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  estado entrega_epp_estado NOT NULL DEFAULT 'pendiente',
  fecha_entrega DATE NOT NULL DEFAULT CURRENT_DATE,
  entregado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  observaciones TEXT,
  confirmado_at TIMESTAMPTZ,
  reclamo_motivo TEXT,
  resolucion TEXT,
  resuelto_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entregas_epp_empleado ON entregas_epp(empleado_id);
CREATE INDEX IF NOT EXISTS idx_entregas_epp_estado ON entregas_epp(estado);
CREATE INDEX IF NOT EXISTS idx_entregas_epp_created_at ON entregas_epp(created_at DESC);

DROP TRIGGER IF EXISTS trg_entregas_epp_updated_at ON entregas_epp;
CREATE TRIGGER trg_entregas_epp_updated_at
  BEFORE UPDATE ON entregas_epp
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Entregas: ítems (qué prendas/elementos incluyó cada entrega)
-- =============================================
CREATE TABLE IF NOT EXISTS entregas_epp_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id UUID NOT NULL REFERENCES entregas_epp(id) ON DELETE CASCADE,
  tipo_item TEXT NOT NULL,
  descripcion TEXT,
  talle TEXT,
  cantidad INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entregas_epp_items_entrega ON entregas_epp_items(entrega_id);

-- =============================================
-- Sellado de fechas al cambiar de estado
-- =============================================
CREATE OR REPLACE FUNCTION entrega_epp_on_estado_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'confirmada' AND NEW.confirmado_at IS NULL THEN
      NEW.confirmado_at := now();
    END IF;
    IF NEW.estado = 'resuelta' AND NEW.resuelto_at IS NULL THEN
      NEW.resuelto_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entrega_epp_sellar_fechas ON entregas_epp;
CREATE TRIGGER trg_entrega_epp_sellar_fechas
  BEFORE UPDATE ON entregas_epp
  FOR EACH ROW EXECUTE FUNCTION entrega_epp_on_estado_change();

-- =============================================
-- Notificaciones (campanita)
-- =============================================

-- Al registrar una entrega: avisarle al empleado que tiene algo por confirmar.
CREATE OR REPLACE FUNCTION notificar_entrega_epp_creada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
  SELECT p.id, 'epp',
         'Entrega de ropa/EPP #' || NEW.numero || ' por confirmar',
         'RRHH registró una entrega a tu nombre. Confirmá el recibo desde Mi ropa.',
         '/mi-ropa'
  FROM profiles p
  WHERE p.empleado_id = NEW.empleado_id
    AND COALESCE(p.active, true) = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_entrega_epp_creada ON entregas_epp;
CREATE TRIGGER trg_notificar_entrega_epp_creada
  AFTER INSERT ON entregas_epp
  FOR EACH ROW EXECUTE FUNCTION notificar_entrega_epp_creada();

-- Al reclamar: avisar a RRHH. Al resolver: avisarle al empleado.
CREATE OR REPLACE FUNCTION notificar_entrega_epp_estado()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empleado_nombre TEXT;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'reclamada' THEN
      SELECT nombre INTO v_empleado_nombre FROM empleados WHERE id = NEW.empleado_id;
      INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
      SELECT p.id, 'epp',
             'Reclamo en entrega #' || NEW.numero || ' · ' || COALESCE(v_empleado_nombre, 'empleado'),
             COALESCE(LEFT(NEW.reclamo_motivo, 140), 'El empleado reclamó la entrega.'),
             '/rrhh/epp'
      FROM profiles p
      WHERE p.role IN ('admin', 'admin_rrhh')
        AND COALESCE(p.active, true) = true
        AND p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
    ELSIF NEW.estado = 'resuelta' THEN
      INSERT INTO notificaciones (user_id, tipo, titulo, mensaje, link)
      SELECT p.id, 'epp',
             'Tu reclamo de la entrega #' || NEW.numero || ' fue resuelto',
             COALESCE(LEFT(NEW.resolucion, 140), 'RRHH resolvió tu reclamo.'),
             '/mi-ropa'
      FROM profiles p
      WHERE p.empleado_id = NEW.empleado_id
        AND COALESCE(p.active, true) = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_entrega_epp_estado ON entregas_epp;
CREATE TRIGGER trg_notificar_entrega_epp_estado
  AFTER UPDATE ON entregas_epp
  FOR EACH ROW EXECUTE FUNCTION notificar_entrega_epp_estado();

-- =============================================
-- RLS (helpers auth_role() / auth_empleado_id() de la migración 037)
-- =============================================
ALTER TABLE empleados_talles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas_epp ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas_epp_items ENABLE ROW LEVEL SECURITY;

-- Talles: el empleado gestiona los suyos; supervisor ve los de su equipo;
-- RRHH/admin todo (lectura y carga manual).
DROP POLICY IF EXISTS "empleados_talles_read" ON empleados_talles;
CREATE POLICY "empleados_talles_read" ON empleados_talles FOR SELECT TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR (auth_role() = 'supervisor' AND EXISTS (
      SELECT 1 FROM empleados e
      WHERE e.id = empleados_talles.empleado_id AND e.supervisor_id = auth_empleado_id()
    ))
    OR empleado_id = auth_empleado_id()
  );

DROP POLICY IF EXISTS "empleados_talles_insert" ON empleados_talles;
CREATE POLICY "empleados_talles_insert" ON empleados_talles FOR INSERT TO authenticated
  WITH CHECK (
    auth_role() IN ('admin', 'admin_rrhh')
    OR empleado_id = auth_empleado_id()
  );

DROP POLICY IF EXISTS "empleados_talles_update" ON empleados_talles;
CREATE POLICY "empleados_talles_update" ON empleados_talles FOR UPDATE TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR empleado_id = auth_empleado_id()
  );

DROP POLICY IF EXISTS "empleados_talles_delete" ON empleados_talles;
CREATE POLICY "empleados_talles_delete" ON empleados_talles FOR DELETE TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'));

-- Entregas: el empleado ve las suyas y sólo puede pasarlas de 'pendiente'
-- a 'confirmada' o 'reclamada'; RRHH/admin todo.
DROP POLICY IF EXISTS "entregas_epp_read" ON entregas_epp;
CREATE POLICY "entregas_epp_read" ON entregas_epp FOR SELECT TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR empleado_id = auth_empleado_id()
  );

DROP POLICY IF EXISTS "entregas_epp_insert" ON entregas_epp;
CREATE POLICY "entregas_epp_insert" ON entregas_epp FOR INSERT TO authenticated
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

DROP POLICY IF EXISTS "entregas_epp_update" ON entregas_epp;
CREATE POLICY "entregas_epp_update" ON entregas_epp FOR UPDATE TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR (empleado_id = auth_empleado_id() AND estado = 'pendiente')
  )
  WITH CHECK (
    auth_role() IN ('admin', 'admin_rrhh')
    OR (empleado_id = auth_empleado_id() AND estado IN ('confirmada', 'reclamada'))
  );

DROP POLICY IF EXISTS "entregas_epp_delete" ON entregas_epp;
CREATE POLICY "entregas_epp_delete" ON entregas_epp FOR DELETE TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'));

-- Ítems: visibles junto con su cabecera; sólo RRHH/admin los escribe.
DROP POLICY IF EXISTS "entregas_epp_items_read" ON entregas_epp_items;
CREATE POLICY "entregas_epp_items_read" ON entregas_epp_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM entregas_epp en
      WHERE en.id = entregas_epp_items.entrega_id
        AND (auth_role() IN ('admin', 'admin_rrhh') OR en.empleado_id = auth_empleado_id())
    )
  );

DROP POLICY IF EXISTS "entregas_epp_items_write" ON entregas_epp_items;
CREATE POLICY "entregas_epp_items_write" ON entregas_epp_items FOR ALL TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

GRANT ALL ON empleados_talles TO anon, authenticated, service_role;
GRANT ALL ON entregas_epp TO anon, authenticated, service_role;
GRANT ALL ON entregas_epp_items TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE entrega_epp_numero_seq TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
