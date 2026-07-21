-- ROLLBACK de 20260721190000_rls_for_all_8_tablas.sql
--
-- Restaura las policies EXACTAMENTE como estaban antes de la migración
-- (generado desde pg_policies el 2026-07-21, no escrito a mano).
--
-- Uso: pegar entero en el SQL editor de Supabase. Deja las 8 tablas con sus
-- dos policies originales sobre `public` y la de escritura como FOR ALL.
-- Vuelve a habilitar el acceso anónimo de lectura: sólo correr si el cambio
-- rompió algo y hace falta volver al estado previo mientras se investiga.

BEGIN;

-- checklist_planes_accion ---------------------------------------------------
DROP POLICY IF EXISTS checklist_planes_accion_select ON public.checklist_planes_accion;
DROP POLICY IF EXISTS checklist_planes_accion_insert ON public.checklist_planes_accion;
DROP POLICY IF EXISTS checklist_planes_accion_update ON public.checklist_planes_accion;
DROP POLICY IF EXISTS checklist_planes_accion_delete ON public.checklist_planes_accion;

DROP POLICY IF EXISTS checklist_planes_accion_read ON public.checklist_planes_accion;
CREATE POLICY checklist_planes_accion_read ON public.checklist_planes_accion AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS checklist_planes_accion_write ON public.checklist_planes_accion;
CREATE POLICY checklist_planes_accion_write ON public.checklist_planes_accion AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))));

-- estandar_flota_cumplimiento -----------------------------------------------
DROP POLICY IF EXISTS estandar_flota_cumpl_select ON public.estandar_flota_cumplimiento;
DROP POLICY IF EXISTS estandar_flota_cumpl_insert ON public.estandar_flota_cumplimiento;
DROP POLICY IF EXISTS estandar_flota_cumpl_update ON public.estandar_flota_cumplimiento;
DROP POLICY IF EXISTS estandar_flota_cumpl_delete ON public.estandar_flota_cumplimiento;

DROP POLICY IF EXISTS estandar_flota_cumpl_select_auth ON public.estandar_flota_cumplimiento;
CREATE POLICY estandar_flota_cumpl_select_auth ON public.estandar_flota_cumplimiento AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS estandar_flota_cumpl_write_editors ON public.estandar_flota_cumplimiento;
CREATE POLICY estandar_flota_cumpl_write_editors ON public.estandar_flota_cumplimiento AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))));

-- estandar_flota_items ------------------------------------------------------
DROP POLICY IF EXISTS estandar_flota_items_select ON public.estandar_flota_items;
DROP POLICY IF EXISTS estandar_flota_items_insert ON public.estandar_flota_items;
DROP POLICY IF EXISTS estandar_flota_items_update ON public.estandar_flota_items;
DROP POLICY IF EXISTS estandar_flota_items_delete ON public.estandar_flota_items;

DROP POLICY IF EXISTS estandar_flota_items_select_auth ON public.estandar_flota_items;
CREATE POLICY estandar_flota_items_select_auth ON public.estandar_flota_items AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS estandar_flota_items_write_editors ON public.estandar_flota_items;
CREATE POLICY estandar_flota_items_write_editors ON public.estandar_flota_items AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))));

-- mantenimiento_realizado_facturas ------------------------------------------
DROP POLICY IF EXISTS mantenimiento_realizado_facturas_select ON public.mantenimiento_realizado_facturas;
DROP POLICY IF EXISTS mantenimiento_realizado_facturas_insert ON public.mantenimiento_realizado_facturas;
DROP POLICY IF EXISTS mantenimiento_realizado_facturas_update ON public.mantenimiento_realizado_facturas;
DROP POLICY IF EXISTS mantenimiento_realizado_facturas_delete ON public.mantenimiento_realizado_facturas;

DROP POLICY IF EXISTS mantenimiento_realizado_facturas_read ON public.mantenimiento_realizado_facturas;
CREATE POLICY mantenimiento_realizado_facturas_read ON public.mantenimiento_realizado_facturas AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS mantenimiento_realizado_facturas_write ON public.mantenimiento_realizado_facturas;
CREATE POLICY mantenimiento_realizado_facturas_write ON public.mantenimiento_realizado_facturas AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))));

-- mantenimiento_realizado_repuestos -----------------------------------------
DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_select ON public.mantenimiento_realizado_repuestos;
DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_insert ON public.mantenimiento_realizado_repuestos;
DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_update ON public.mantenimiento_realizado_repuestos;
DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_delete ON public.mantenimiento_realizado_repuestos;

DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_read ON public.mantenimiento_realizado_repuestos;
CREATE POLICY mantenimiento_realizado_repuestos_read ON public.mantenimiento_realizado_repuestos AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS mantenimiento_realizado_repuestos_write ON public.mantenimiento_realizado_repuestos;
CREATE POLICY mantenimiento_realizado_repuestos_write ON public.mantenimiento_realizado_repuestos AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))));

-- mantenimiento_rotaciones --------------------------------------------------
DROP POLICY IF EXISTS mantenimiento_rotaciones_select ON public.mantenimiento_rotaciones;
DROP POLICY IF EXISTS mantenimiento_rotaciones_insert ON public.mantenimiento_rotaciones;
DROP POLICY IF EXISTS mantenimiento_rotaciones_update ON public.mantenimiento_rotaciones;
DROP POLICY IF EXISTS mantenimiento_rotaciones_delete ON public.mantenimiento_rotaciones;

DROP POLICY IF EXISTS mantenimiento_rotaciones_read ON public.mantenimiento_rotaciones;
CREATE POLICY mantenimiento_rotaciones_read ON public.mantenimiento_rotaciones AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS mantenimiento_rotaciones_write ON public.mantenimiento_rotaciones;
CREATE POLICY mantenimiento_rotaciones_write ON public.mantenimiento_rotaciones AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role)::text = ANY (ARRAY['admin'::text, 'supervisor'::text]))))));

-- requisitos_legales_raci_filas ---------------------------------------------
DROP POLICY IF EXISTS req_legales_raci_filas_select ON public.requisitos_legales_raci_filas;
DROP POLICY IF EXISTS req_legales_raci_filas_insert ON public.requisitos_legales_raci_filas;
DROP POLICY IF EXISTS req_legales_raci_filas_update ON public.requisitos_legales_raci_filas;
DROP POLICY IF EXISTS req_legales_raci_filas_delete ON public.requisitos_legales_raci_filas;

DROP POLICY IF EXISTS req_legales_raci_filas_select_auth ON public.requisitos_legales_raci_filas;
CREATE POLICY req_legales_raci_filas_select_auth ON public.requisitos_legales_raci_filas AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS req_legales_raci_filas_write_editors ON public.requisitos_legales_raci_filas;
CREATE POLICY req_legales_raci_filas_write_editors ON public.requisitos_legales_raci_filas AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))));

-- requisitos_legales_raci_roles ---------------------------------------------
DROP POLICY IF EXISTS req_legales_raci_roles_select ON public.requisitos_legales_raci_roles;
DROP POLICY IF EXISTS req_legales_raci_roles_insert ON public.requisitos_legales_raci_roles;
DROP POLICY IF EXISTS req_legales_raci_roles_update ON public.requisitos_legales_raci_roles;
DROP POLICY IF EXISTS req_legales_raci_roles_delete ON public.requisitos_legales_raci_roles;

DROP POLICY IF EXISTS req_legales_raci_roles_select_auth ON public.requisitos_legales_raci_roles;
CREATE POLICY req_legales_raci_roles_select_auth ON public.requisitos_legales_raci_roles AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS req_legales_raci_roles_write_editors ON public.requisitos_legales_raci_roles;
CREATE POLICY req_legales_raci_roles_write_editors ON public.requisitos_legales_raci_roles AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]))))));

COMMIT;
