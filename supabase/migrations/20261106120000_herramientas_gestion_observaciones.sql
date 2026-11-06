-- Herramientas de gestión sobre observaciones de reunión (06/11/2026)
--
-- PROBLEMA: en la Reunión de Logística del 06/11/2026 se cargó la observación
-- "Rechazo 2,1 % - Camión DH muchos cerrados en Colón" sobre el indicador
-- Rechazos % y se quiso aplicar un 5XQ. La herramienta sólo se podía colgar de
-- una ACCIÓN, así que hubo que crear una acción "Rechazos 2,1 %" que no era una
-- tarea sino el análisis, y cerrarla en el acto.
--
-- QUÉ CAMBIA: sexto target `reunion_observacion_id` → la observación del
-- tablero, de un SLA o de una sección. La contramedida sale como acción aparte
-- (eso lo hace la app). Los cinco targets viejos no se tocan y la restricción
-- sigue exigiendo exactamente UNO.
--
-- Permiso: las observaciones sólo las escriben los editores
-- (admin/supervisor/admin_rrhh). La función puede_escribir_herramienta_gestion
-- no cambia de firma: para una observación los cinco ids llegan NULL, así que
-- sólo pasa el editor global, que es exactamente la regla de las observaciones.

begin;

alter table public.plan_herramientas_gestion
  add column if not exists reunion_observacion_id uuid
    references public.reuniones_indicadores_observaciones(id) on delete cascade;

create index if not exists idx_plan_herramientas_reunion_observacion
  on public.plan_herramientas_gestion(reunion_observacion_id);

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
      (case when flota_plan_accion_id is not null then 1 else 0 end) +
      (case when reunion_observacion_id is not null then 1 else 0 end)
    ) = 1
  );

comment on column public.plan_herramientas_gestion.reunion_observacion_id is
  'Observación de reunión (tablero, SLA o sección) sobre la que se aplicó la herramienta.';

commit;
