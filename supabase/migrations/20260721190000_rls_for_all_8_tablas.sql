-- RLS: separar las policies FOR ALL en 8 tablas y cerrarlas a `authenticated`.
--
-- Problema (advisors de performance, 2026-07-21):
--   Estas 8 tablas tenían una policy de lectura (`USING true`) y una de
--   escritura declarada `FOR ALL TO public`. `FOR ALL` incluye SELECT, así que
--   en CADA lectura Postgres evaluaba también la condición de escritura —un
--   EXISTS contra `profiles`— POR FILA, sin que eso cambiara el resultado:
--   la policy de lectura ya devolvía `true`.
--
--   Además, al estar sobre `public` en vez de `authenticated`, ambas policies
--   alcanzaban al rol `anon`: las tablas eran legibles sin autenticar.
--
-- Cambio:
--   - La policy FOR ALL se reemplaza por INSERT / UPDATE / DELETE con la MISMA
--     condición. Los permisos efectivos de escritura no cambian.
--   - Todas las policies pasan a `TO authenticated`.
--
-- Verificado antes de aplicar: los únicos accesos a estas tablas son server
-- actions con requireAuth() (rol authenticated) y el cron de Cloudfleet, que
-- usa createAdminClient() —service role, que bypassa RLS—. No hay ningún
-- consumidor anónimo legítimo.
--
-- Rollback: ROLLBACK_20260721190000_rls_for_all_8_tablas.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Grupo A — condición: profiles.role IN (admin, supervisor)
-- ---------------------------------------------------------------------------

-- checklist_planes_accion
DROP POLICY IF EXISTS checklist_planes_accion_read ON public.checklist_planes_accion;
DROP POLICY IF EXISTS checklist_planes_accion_write ON public.checklist_planes_accion;

CREATE POLICY checklist_planes_accion_select ON public.checklist_planes_accion
  FOR SELECT TO authenticated USING (true);
CREATE POLICY checklist_planes_accion_insert ON public.checklist_planes_accion
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY checklist_planes_accion_update ON public.checklist_planes_accion
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY checklist_planes_accion_delete ON public.checklist_planes_accion
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));

-- mantenimiento_realizado_facturas
DROP POLICY IF EXISTS mantenimiento_realizado_facturas_read ON public.mantenimiento_realizado_facturas;
DROP POLICY IF EXISTS mantenimiento_realizado_facturas_write ON public.mantenimiento_realizado_facturas;

CREATE POLICY mantenimiento_realizado_facturas_select ON public.mantenimiento_realizado_facturas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mantenimiento_realizado_facturas_insert ON public.mantenimiento_realizado_facturas
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY mantenimiento_realizado_facturas_update ON public.mantenimiento_realizado_facturas
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY mantenimiento_realizado_facturas_delete ON public.mantenimiento_realizado_facturas
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));

-- mantenimiento_realizado_repuestos
DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_read ON public.mantenimiento_realizado_repuestos;
DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_write ON public.mantenimiento_realizado_repuestos;

CREATE POLICY mantenimiento_realizado_repuestos_select ON public.mantenimiento_realizado_repuestos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mantenimiento_realizado_repuestos_insert ON public.mantenimiento_realizado_repuestos
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY mantenimiento_realizado_repuestos_update ON public.mantenimiento_realizado_repuestos
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY mantenimiento_realizado_repuestos_delete ON public.mantenimiento_realizado_repuestos
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));

-- mantenimiento_rotaciones
DROP POLICY IF EXISTS mantenimiento_rotaciones_read ON public.mantenimiento_rotaciones;
DROP POLICY IF EXISTS mantenimiento_rotaciones_write ON public.mantenimiento_rotaciones;

CREATE POLICY mantenimiento_rotaciones_select ON public.mantenimiento_rotaciones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mantenimiento_rotaciones_insert ON public.mantenimiento_rotaciones
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY mantenimiento_rotaciones_update ON public.mantenimiento_rotaciones
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));
CREATE POLICY mantenimiento_rotaciones_delete ON public.mantenimiento_rotaciones
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND (p.role)::text = ANY (ARRAY['admin', 'supervisor'])));

-- ---------------------------------------------------------------------------
-- Grupo B — condición: profiles.role IN (admin, supervisor, admin_rrhh)
-- ---------------------------------------------------------------------------

-- estandar_flota_cumplimiento
DROP POLICY IF EXISTS estandar_flota_cumpl_select_auth ON public.estandar_flota_cumplimiento;
DROP POLICY IF EXISTS estandar_flota_cumpl_write_editors ON public.estandar_flota_cumplimiento;

CREATE POLICY estandar_flota_cumpl_select ON public.estandar_flota_cumplimiento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY estandar_flota_cumpl_insert ON public.estandar_flota_cumplimiento
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY estandar_flota_cumpl_update ON public.estandar_flota_cumplimiento
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY estandar_flota_cumpl_delete ON public.estandar_flota_cumplimiento
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));

-- estandar_flota_items
DROP POLICY IF EXISTS estandar_flota_items_select_auth ON public.estandar_flota_items;
DROP POLICY IF EXISTS estandar_flota_items_write_editors ON public.estandar_flota_items;

CREATE POLICY estandar_flota_items_select ON public.estandar_flota_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY estandar_flota_items_insert ON public.estandar_flota_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY estandar_flota_items_update ON public.estandar_flota_items
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY estandar_flota_items_delete ON public.estandar_flota_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));

-- requisitos_legales_raci_filas
DROP POLICY IF EXISTS req_legales_raci_filas_select_auth ON public.requisitos_legales_raci_filas;
DROP POLICY IF EXISTS req_legales_raci_filas_write_editors ON public.requisitos_legales_raci_filas;

CREATE POLICY req_legales_raci_filas_select ON public.requisitos_legales_raci_filas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY req_legales_raci_filas_insert ON public.requisitos_legales_raci_filas
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY req_legales_raci_filas_update ON public.requisitos_legales_raci_filas
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY req_legales_raci_filas_delete ON public.requisitos_legales_raci_filas
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));

-- requisitos_legales_raci_roles
DROP POLICY IF EXISTS req_legales_raci_roles_select_auth ON public.requisitos_legales_raci_roles;
DROP POLICY IF EXISTS req_legales_raci_roles_write_editors ON public.requisitos_legales_raci_roles;

CREATE POLICY req_legales_raci_roles_select ON public.requisitos_legales_raci_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY req_legales_raci_roles_insert ON public.requisitos_legales_raci_roles
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY req_legales_raci_roles_update ON public.requisitos_legales_raci_roles
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));
CREATE POLICY req_legales_raci_roles_delete ON public.requisitos_legales_raci_roles
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role])));

COMMIT;
