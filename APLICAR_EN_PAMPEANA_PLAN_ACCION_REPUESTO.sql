-- =====================================================================
-- El plan de accion del checklist descuenta el repuesto del panol
-- =====================================================================
--
-- POR QUE: en este CD no se hace mantenimiento propio salvo cambiar un foco,
-- una mica o un destellador. Eso NO pasa por una OT: pasa por un item NO OK
-- del checklist que el supervisor marca resuelto en el plan de accion. El
-- descuento del panol lo venia haciendo el a mano, aparte, y por eso el stock
-- se despegaba de la realidad y el consumo real no quedaba trazado en ningun
-- lado.
--
-- Con estas tres columnas, al cerrar el plan se registra el egreso solo, con
-- el motivo armado a partir del checklist. La descripcion del plan sigue
-- siendo texto libre: el repuesto es un dato aparte, para que se pueda contar.
--
-- `movimiento_id` es el candado: guarda el egreso que este plan ya genero, asi
-- editar la descripcion o cambiar la foto no vuelve a descontar. Es la unica
-- forma de hacerlo idempotente, porque el plan es editable por diseno
-- (unique(respuesta_id), se hace upsert cada vez que se guarda).
--
-- Las tres columnas son opcionales: un plan sin repuesto -la mayoria- sigue
-- funcionando exactamente igual que antes.
-- =====================================================================

alter table public.checklist_planes_accion
  add column if not exists repuesto_id uuid
    references public.mantenimiento_repuestos(id) on delete set null;

alter table public.checklist_planes_accion
  add column if not exists repuesto_cantidad numeric;

alter table public.checklist_planes_accion
  add column if not exists movimiento_id uuid
    references public.mantenimiento_repuestos_movimientos(id) on delete set null;

comment on column public.checklist_planes_accion.repuesto_id is
  'Repuesto del panol que se uso para resolver el item (foco, mica, destellador, carro). NULL = no salio nada del panol.';
comment on column public.checklist_planes_accion.repuesto_cantidad is
  'Cuantas unidades de ese repuesto se usaron. NULL cuando no hay repuesto.';
comment on column public.checklist_planes_accion.movimiento_id is
  'Egreso de panol que genero este plan. Es el candado contra el doble descuento: si ya tiene movimiento, no se descuenta de nuevo.';

create index if not exists idx_checklist_planes_accion_repuesto
  on public.checklist_planes_accion (repuesto_id)
  where repuesto_id is not null;

-- Verificacion.
select column_name, data_type
from information_schema.columns
where table_name = 'checklist_planes_accion'
  and column_name in ('repuesto_id', 'repuesto_cantidad', 'movimiento_id')
order by column_name;
