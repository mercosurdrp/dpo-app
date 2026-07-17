-- Movimientos de stock de repuestos (ingreso/egreso) con historial.
-- El stock_actual de mantenimiento_repuestos se ajusta SOLO vía la función
-- registrar_movimiento_repuesto (atómica, con lock de fila), para que +/-
-- concurrentes no pisen el número. El conteo físico mensual sigue igual.
-- (Ya aplicada a prod por MCP; idempotente para consistencia del repo.)

create table if not exists public.mantenimiento_repuestos_movimientos (
  id uuid primary key default gen_random_uuid(),
  repuesto_id uuid not null references public.mantenimiento_repuestos(id) on delete cascade,
  tipo text not null check (tipo in ('ingreso','egreso')),
  cantidad numeric not null check (cantidad > 0),
  motivo text,
  stock_resultante numeric not null,
  fecha date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_mant_rep_mov_repuesto
  on public.mantenimiento_repuestos_movimientos(repuesto_id, created_at desc);

alter table public.mantenimiento_repuestos_movimientos enable row level security;

drop policy if exists mant_rep_mov_read on public.mantenimiento_repuestos_movimientos;
create policy mant_rep_mov_read on public.mantenimiento_repuestos_movimientos
  for select to authenticated using (true);

drop policy if exists mant_rep_mov_write on public.mantenimiento_repuestos_movimientos;
create policy mant_rep_mov_write on public.mantenimiento_repuestos_movimientos
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
                 and (p.role)::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()
                      and (p.role)::text = any (array['admin','supervisor'])));

-- Registra un movimiento y ajusta el stock en una sola transacción.
create or replace function public.registrar_movimiento_repuesto(
  p_repuesto_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_motivo text default null,
  p_fecha date default null
)
returns public.mantenimiento_repuestos_movimientos
language plpgsql
security invoker
as $$
declare
  v_stock numeric;
  v_nuevo numeric;
  v_mov public.mantenimiento_repuestos_movimientos;
begin
  if p_tipo not in ('ingreso','egreso') then
    raise exception 'Tipo inválido: %', p_tipo;
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select stock_actual into v_stock
  from public.mantenimiento_repuestos
  where id = p_repuesto_id
  for update;

  if not found then
    raise exception 'Repuesto no encontrado';
  end if;

  v_nuevo := v_stock + (case when p_tipo = 'ingreso' then p_cantidad else -p_cantidad end);

  if v_nuevo < 0 then
    raise exception 'Stock insuficiente: hay % y querés egresar %', v_stock, p_cantidad;
  end if;

  update public.mantenimiento_repuestos
  set stock_actual = v_nuevo, updated_at = now()
  where id = p_repuesto_id;

  insert into public.mantenimiento_repuestos_movimientos
    (repuesto_id, tipo, cantidad, motivo, stock_resultante, fecha, created_by)
  values
    (p_repuesto_id, p_tipo, p_cantidad, nullif(trim(p_motivo), ''), v_nuevo,
     coalesce(p_fecha, current_date), auth.uid())
  returning * into v_mov;

  return v_mov;
end;
$$;
