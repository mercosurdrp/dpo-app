-- El ciclo de gestión llega a Flota (25/08/2026)
--
-- PROBLEMA: las herramientas de gestión (5 Porqués, Causa-Efecto, PDCA) sólo
-- podían colgarse de un plan de acción DPO, de una actividad de reunión o de un
-- reporte de seguridad. Flota no tenía ningún enganche: si la misma OT
-- correctiva se repetía en la misma unidad, no había desde dónde abrir un 5
-- Porqués, y la causa raíz del KPI en rojo se escribía como texto suelto en
-- `flota_plan_accion.causa_raiz`, sin método atrás.
--
-- Se ve en los números: en toda la base hay 12 cinco-porqués y UN PDCA, ninguno
-- de flota. La herramienta existía; el pilar que más correctivo genera no la
-- usaba porque no tenía puerta de entrada.
--
-- QUÉ CAMBIA: dos targets nuevos.
--   * `mantenimiento_id`      → la OT (típicamente correctiva). DPO 4.2.
--   * `flota_plan_accion_id`  → el plan de acción del KPI de flota en rojo.
--
-- El resto no se toca: los tres targets viejos siguen igual y la restricción
-- sigue exigiendo exactamente UNO.

begin;

alter table public.plan_herramientas_gestion
  add column if not exists mantenimiento_id uuid
    references public.mantenimiento_realizados(id) on delete cascade,
  add column if not exists flota_plan_accion_id uuid
    references public.flota_plan_accion(id) on delete cascade;

create index if not exists idx_plan_herramientas_mantenimiento
  on public.plan_herramientas_gestion(mantenimiento_id);
create index if not exists idx_plan_herramientas_flota_plan
  on public.plan_herramientas_gestion(flota_plan_accion_id);

-- Exactamente uno de los CINCO targets.
alter table public.plan_herramientas_gestion
  drop constraint if exists plan_herramientas_target_chk;
alter table public.plan_herramientas_gestion
  add constraint plan_herramientas_target_chk
  check (
    (
      (case when plan_id is not null then 1 else 0 end) +
      (case when reunion_actividad_id is not null then 1 else 0 end) +
      (case when reporte_seguridad_id is not null then 1 else 0 end) +
      (case when mantenimiento_id is not null then 1 else 0 end) +
      (case when flota_plan_accion_id is not null then 1 else 0 end)
    ) = 1
  );

-- ---------------------------------------------------------------------------
-- Permiso de escritura, en una función
--
-- Las políticas de INSERT y UPDATE repetían el mismo bloque de ~40 líneas tres
-- veces (WITH CHECK del insert, USING y WITH CHECK del update). Con dos targets
-- más eran cinco ramas por bloque. La regla pasa a una función y las políticas
-- quedan de una línea; la semántica de los tres targets viejos es idéntica.
-- ---------------------------------------------------------------------------
create or replace function public.puede_escribir_herramienta_gestion(
  p_plan_id uuid,
  p_actividad_id uuid,
  p_reporte_id uuid,
  p_mantenimiento_id uuid,
  p_flota_plan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Editor global: vale para cualquier target.
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'supervisor', 'admin_rrhh')
    )
    -- Plan de acción DPO: responsable del plan o quien lo creó.
    or (p_plan_id is not null and (
      p_plan_id in (select plan_id from public.plan_responsables where profile_id = auth.uid())
      or p_plan_id in (select id from public.planes_accion where created_by = auth.uid())
    ))
    -- Actividad de reunión: su responsable.
    or (p_actividad_id is not null and
      p_actividad_id in (select id from public.reuniones_actividades where responsable_id = auth.uid()))
    -- Reporte de seguridad: quien lo cargó.
    or (p_reporte_id is not null and
      p_reporte_id in (select id from public.reportes_seguridad where creado_por = auth.uid()))
    -- Flota (OT y plan del KPI): sólo editores, que ya son los únicos que
    -- pueden cargar una OT o un plan de flota.
    or false;
$$;

drop policy if exists "herramientas_gestion_insert" on public.plan_herramientas_gestion;
create policy "herramientas_gestion_insert"
  on public.plan_herramientas_gestion for insert to authenticated
  with check (
    public.puede_escribir_herramienta_gestion(
      plan_id, reunion_actividad_id, reporte_seguridad_id, mantenimiento_id, flota_plan_accion_id
    )
  );

drop policy if exists "herramientas_gestion_update" on public.plan_herramientas_gestion;
create policy "herramientas_gestion_update"
  on public.plan_herramientas_gestion for update to authenticated
  using (
    public.puede_escribir_herramienta_gestion(
      plan_id, reunion_actividad_id, reporte_seguridad_id, mantenimiento_id, flota_plan_accion_id
    )
  )
  with check (
    public.puede_escribir_herramienta_gestion(
      plan_id, reunion_actividad_id, reporte_seguridad_id, mantenimiento_id, flota_plan_accion_id
    )
  );

comment on column public.plan_herramientas_gestion.mantenimiento_id is
  'OT sobre la que se aplicó la herramienta (causa raíz del correctivo, DPO 4.2).';
comment on column public.plan_herramientas_gestion.flota_plan_accion_id is
  'Plan de acción del KPI de flota sobre el que se aplicó la herramienta.';

commit;
