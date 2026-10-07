-- =====================================================================
-- El plan de accion del checklist apunta a su OT
-- =====================================================================
--
-- POR QUE: la cadena de un checklist rechazado es
--
--   checklist rechazado -> foco -> plan de accion (resuelto) -> y si es mas
--   grave que un foco o un relay, el plan deriva en una OT programada.
--
-- Los dos primeros tramos ya estaban. El ultimo no: `checklist_planes_accion`
-- no tenia ningun vinculo con `mantenimiento_realizados`, asi que la relacion
-- existia solo si alguien la escribia a mano en el texto del plan. El KPI que
-- cruza focos con OT la venia ADIVINANDO por unidad y fecha (una correctiva con
-- un defecto del checklist en los 15 dias previos), que es una heuristica, no
-- una trazabilidad.
--
-- Con `ot_id` el plan dice cual es su OT y el N° de OT se puede mostrar en la
-- fila del rechazo y en el modulo de focos.
--
-- ON DELETE SET NULL, no CASCADE: el plan es la constancia de lo que se hizo
-- con el foco. Si la OT se borra, el plan tiene que sobrevivir sin OT, no
-- desaparecer con ella y dejar el rechazo otra vez sin explicacion.
--
-- La columna es opcional: la enorme mayoria de los planes -cambiar un foco, una
-- mica, un destellador- no pasa por ninguna OT y sigue funcionando igual.
-- =====================================================================

alter table public.checklist_planes_accion
  add column if not exists ot_id uuid
    references public.mantenimiento_realizados(id) on delete set null;

comment on column public.checklist_planes_accion.ot_id is
  'OT en la que se repara el defecto cuando es mas grave que un foco o un relay. NULL = se resolvio sin OT.';

create index if not exists idx_checklist_planes_accion_ot
  on public.checklist_planes_accion (ot_id)
  where ot_id is not null;

-- Verificacion.
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'checklist_planes_accion'
  and column_name = 'ot_id';
