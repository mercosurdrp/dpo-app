-- =============================================
-- 040 · RRHH: Row-Level Security para todas las tablas nuevas
-- =============================================
-- Reglas:
--   - empleado: ve sólo sus datos / sus solicitudes / su saldo / su jornada
--   - supervisor: ve a su equipo (empleados con supervisor_id = mi_empleado_id)
--   - admin_rrhh y admin: ven todo, escriben todo
-- =============================================

BEGIN;

-- =============================================
-- empleados (extendido) — añadimos / re-creamos políticas con visibilidad RRHH
-- Las políticas viejas se mantienen por compatibilidad si existen; usamos
-- nombres distintos para las nuevas.
-- =============================================
ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empleados_rrhh_read ON empleados;
CREATE POLICY empleados_rrhh_read
  ON empleados FOR SELECT TO authenticated
  USING (
    -- admin / admin_rrhh / auditor / viewer ven todo
    auth_role() IN ('admin', 'admin_rrhh', 'auditor', 'viewer')
    -- supervisor ve a sí mismo y a su equipo (incluye recursivo? por ahora directo)
    OR (auth_role() = 'supervisor' AND (id = auth_empleado_id() OR supervisor_id = auth_empleado_id()))
    -- empleado se ve a sí mismo
    OR (auth_role() = 'empleado' AND id = auth_empleado_id())
  );

DROP POLICY IF EXISTS empleados_rrhh_insert ON empleados;
CREATE POLICY empleados_rrhh_insert
  ON empleados FOR INSERT TO authenticated
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

DROP POLICY IF EXISTS empleados_rrhh_update ON empleados;
CREATE POLICY empleados_rrhh_update
  ON empleados FOR UPDATE TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'));

DROP POLICY IF EXISTS empleados_rrhh_delete ON empleados;
CREATE POLICY empleados_rrhh_delete
  ON empleados FOR DELETE TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'));

-- =============================================
-- rrhh_tipos_licencia
-- =============================================
ALTER TABLE rrhh_tipos_licencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY tipos_licencia_read
  ON rrhh_tipos_licencia FOR SELECT TO authenticated USING (true);

CREATE POLICY tipos_licencia_admin_write
  ON rrhh_tipos_licencia FOR ALL TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

-- =============================================
-- rrhh_saldos_vacaciones
-- =============================================
ALTER TABLE rrhh_saldos_vacaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY saldos_read
  ON rrhh_saldos_vacaciones FOR SELECT TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR (auth_role() = 'supervisor' AND EXISTS (
      SELECT 1 FROM empleados e
      WHERE e.id = rrhh_saldos_vacaciones.empleado_id
        AND e.supervisor_id = auth_empleado_id()
    ))
    OR (auth_role() = 'empleado' AND empleado_id = auth_empleado_id())
  );

CREATE POLICY saldos_admin_write
  ON rrhh_saldos_vacaciones FOR ALL TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

-- =============================================
-- rrhh_solicitudes_licencia
-- =============================================
ALTER TABLE rrhh_solicitudes_licencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY solicitudes_read
  ON rrhh_solicitudes_licencia FOR SELECT TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR (auth_role() = 'supervisor' AND supervisor_id = auth_empleado_id())
    OR (empleado_id = auth_empleado_id())
  );

-- Empleado puede crear solicitudes para sí mismo.
CREATE POLICY solicitudes_insert
  ON rrhh_solicitudes_licencia FOR INSERT TO authenticated
  WITH CHECK (
    empleado_id = auth_empleado_id()
    OR auth_role() IN ('admin', 'admin_rrhh')
  );

-- Update: el empleado puede cancelar la suya mientras esté pendiente_supervisor;
-- el supervisor puede aprobar/rechazar las que tenga asignadas;
-- el admin_rrhh puede hacer cualquier transición.
CREATE POLICY solicitudes_update
  ON rrhh_solicitudes_licencia FOR UPDATE TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh')
    OR (auth_role() = 'supervisor' AND supervisor_id = auth_empleado_id())
    OR (empleado_id = auth_empleado_id() AND estado = 'pendiente_supervisor')
  );

CREATE POLICY solicitudes_delete
  ON rrhh_solicitudes_licencia FOR DELETE TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'));

-- =============================================
-- rrhh_jornadas_plantilla — todos leen, sólo admin_rrhh/admin escriben.
-- =============================================
ALTER TABLE rrhh_jornadas_plantilla ENABLE ROW LEVEL SECURITY;

CREATE POLICY jornadas_plantilla_read
  ON rrhh_jornadas_plantilla FOR SELECT TO authenticated USING (true);

CREATE POLICY jornadas_plantilla_admin_write
  ON rrhh_jornadas_plantilla FOR ALL TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

-- =============================================
-- rrhh_jornadas_asignacion
-- =============================================
ALTER TABLE rrhh_jornadas_asignacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY jornadas_asignacion_read
  ON rrhh_jornadas_asignacion FOR SELECT TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh', 'auditor', 'viewer')
    OR (auth_role() = 'supervisor' AND EXISTS (
      SELECT 1 FROM empleados e
      WHERE e.id = rrhh_jornadas_asignacion.empleado_id
        AND e.supervisor_id = auth_empleado_id()
    ))
    OR (auth_role() = 'empleado' AND empleado_id = auth_empleado_id())
  );

CREATE POLICY jornadas_asignacion_admin_write
  ON rrhh_jornadas_asignacion FOR ALL TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

-- =============================================
-- rrhh_jornadas_excepcion
-- =============================================
ALTER TABLE rrhh_jornadas_excepcion ENABLE ROW LEVEL SECURITY;

CREATE POLICY jornadas_excepcion_read
  ON rrhh_jornadas_excepcion FOR SELECT TO authenticated
  USING (
    auth_role() IN ('admin', 'admin_rrhh', 'auditor', 'viewer')
    OR (auth_role() = 'supervisor' AND EXISTS (
      SELECT 1 FROM empleados e
      WHERE e.id = rrhh_jornadas_excepcion.empleado_id
        AND e.supervisor_id = auth_empleado_id()
    ))
    OR (auth_role() = 'empleado' AND empleado_id = auth_empleado_id())
  );

CREATE POLICY jornadas_excepcion_admin_write
  ON rrhh_jornadas_excepcion FOR ALL TO authenticated
  USING (auth_role() IN ('admin', 'admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin', 'admin_rrhh'));

COMMIT;
