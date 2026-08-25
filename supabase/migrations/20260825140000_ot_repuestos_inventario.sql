-- Los repuestos de la OT descuentan del inventario (25/08/2026)
--
-- PROBLEMA: el punto 2.3 de DPO pide trazabilidad de las piezas. Hasta hoy la
-- app tenía las dos mitades sin unir:
--
--   * `mantenimiento_realizado_repuestos` guardaba el repuesto de la OT como
--     TEXTO LIBRE ("LIQUIDO REFRIGERANTE — 20 lts"), sin apuntar al ítem del
--     pañol.
--   * `mantenimiento_repuestos_movimientos` tenía el egreso, pero se cargaba a
--     mano, con el motivo también en texto libre ("Cambio de foco en AF028YB —
--     hecho en casa, sin pasar por taller").
--
-- Resultado: un foco cambiado en depósito NO descontaba de ningún lado. El
-- stock del pañol sólo se corregía en el conteo físico mensual, y ahí el
-- desvío aparecía sin causa.
--
-- QUÉ CAMBIA: la fila de repuesto de la OT puede apuntar al ítem de inventario
-- (`repuesto_id`). Cuando apunta, la base registra el egreso sola y deja el
-- movimiento enganchado (`movimiento_id`), en la misma transacción que la OT.
--
-- El campo es OPCIONAL a propósito: el repuesto que se compra para la OT y va
-- directo al camión nunca entró al pañol y no tiene por qué descontar. Sólo se
-- vincula lo que sale del stock. Las filas viejas quedan como están.
--
-- REVERSO: editar o borrar la OT devuelve la pieza al stock con un movimiento
-- de ingreso. El historial queda con el egreso y su reverso, que es lo que un
-- auditor espera ver — no un número que cambió sin rastro.

alter table public.mantenimiento_realizado_repuestos
  add column if not exists repuesto_id uuid
    references public.mantenimiento_repuestos(id) on delete set null,
  add column if not exists movimiento_id uuid
    references public.mantenimiento_repuestos_movimientos(id) on delete set null;

create index if not exists mantenimiento_realizado_repuestos_repuesto_idx
  on public.mantenimiento_realizado_repuestos (repuesto_id)
  where repuesto_id is not null;

comment on column public.mantenimiento_realizado_repuestos.repuesto_id is
  'Ítem del pañol del que salió la pieza. NULL = comprado para la OT, nunca entró al stock.';
comment on column public.mantenimiento_realizado_repuestos.movimiento_id is
  'Egreso de stock que generó esta fila. Lo escribe el trigger; no se toca a mano.';

-- Texto del motivo del movimiento: quien mire el historial del repuesto tiene
-- que poder llegar a la OT sin preguntarle a nadie.
create or replace function public.ot_repuesto_motivo(p_mantenimiento_id uuid)
returns text
language sql
stable
as $$
  select 'OT ' || coalesce(m.numero_ot, '(sin nº)') || ' — ' || m.dominio
  from public.mantenimiento_realizados m
  where m.id = p_mantenimiento_id;
$$;

-- Egreso al cargar la fila, reverso al borrarla, y las dos cosas al editarla.
create or replace function public.fn_ot_repuesto_stock()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_mov public.mantenimiento_repuestos_movimientos;
  v_nombre text;
  v_stock numeric;
begin
  -- Reverso de lo que había (UPDATE y DELETE).
  if (tg_op = 'DELETE' or tg_op = 'UPDATE') and old.movimiento_id is not null then
    perform public.registrar_movimiento_repuesto(
      old.repuesto_id,
      'ingreso',
      old.cantidad,
      'Reverso · ' || coalesce(public.ot_repuesto_motivo(old.mantenimiento_id), 'OT eliminada'),
      null
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Egreso de lo nuevo (INSERT y UPDATE).
  new.movimiento_id := null;
  if new.repuesto_id is not null then
    select nombre, stock_actual into v_nombre, v_stock
    from public.mantenimiento_repuestos
    where id = new.repuesto_id;

    -- El mensaje de la función base no dice de qué repuesto habla. Acá sí, que
    -- es lo único que el que carga la OT puede accionar.
    if v_stock < new.cantidad then
      raise exception 'Stock insuficiente de "%": hay % y la OT descuenta %. Cargá primero el ingreso al pañol, o dejá el repuesto sin vincular si se compró para esta OT.',
        v_nombre, v_stock, new.cantidad;
    end if;

    v_mov := public.registrar_movimiento_repuesto(
      new.repuesto_id,
      'egreso',
      new.cantidad,
      public.ot_repuesto_motivo(new.mantenimiento_id),
      null
    );
    new.movimiento_id := v_mov.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ot_repuesto_stock_ins on public.mantenimiento_realizado_repuestos;
create trigger trg_ot_repuesto_stock_ins
  before insert on public.mantenimiento_realizado_repuestos
  for each row execute function public.fn_ot_repuesto_stock();

drop trigger if exists trg_ot_repuesto_stock_upd on public.mantenimiento_realizado_repuestos;
create trigger trg_ot_repuesto_stock_upd
  before update of repuesto_id, cantidad on public.mantenimiento_realizado_repuestos
  for each row
  when (old.repuesto_id is distinct from new.repuesto_id or old.cantidad is distinct from new.cantidad)
  execute function public.fn_ot_repuesto_stock();

drop trigger if exists trg_ot_repuesto_stock_del on public.mantenimiento_realizado_repuestos;
create trigger trg_ot_repuesto_stock_del
  after delete on public.mantenimiento_realizado_repuestos
  for each row execute function public.fn_ot_repuesto_stock();
