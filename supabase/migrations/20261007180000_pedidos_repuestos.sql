-- =====================================================================
-- Pedidos de repuestos: una sola solapa en lugar de Novedades + OC
-- =====================================================================
--
-- POR QUE: habia DOS solapas a medias haciendo lo mismo. `mantenimiento_novedades`
-- (0 filas desde que existe) guardaba unidad/fecha/prioridad/descripcion, y
-- `mantenimiento_ordenes_compra` (1 fila) guardaba proveedor/monto/estado con la
-- descripcion como texto libre. Ninguna de las dos registra lo unico que hace
-- falta para medir: QUE piezas se piden, PARA QUE OT, cuando se compran y cuando
-- se retiran.
--
-- Sin ese dato no existe el PI que el propio requisito R2.3.3 nombra textual
-- -"pedidos de servicio retrasados debido a las piezas"- y los niveles de stock
-- no se pueden corregir, porque cuando una pieza se agota y se repone el stock
-- vuelve al minimo y no queda rastro de que falto (R2.3.2).
--
-- Y hay un problema de datos que esto corta de raiz: las mismas piezas se
-- tipean distinto cada vez. En las OT conviven "filtro gasoil", "FILTRO
-- COMBUSTIBLEE", "FILTRO GASOIL TRAMPA DE AGUA" y "filtro trampa agua" para dos
-- piezas. Con lista para tildar, el nombre lo pone el catalogo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El catalogo pasa a tener piezas que NO son de panol
-- ---------------------------------------------------------------------
-- Los filtros y aceites no se stockean: los trae el taller contra la OT. Pero
-- hay que poder elegirlos al pedir. Entran al mismo catalogo marcados
-- `en_panol = false`, asi el inventario, los recuentos y la exactitud siguen
-- contando solo lo que de verdad esta en el panol.
alter table public.mantenimiento_repuestos
  add column if not exists en_panol boolean not null default true;

comment on column public.mantenimiento_repuestos.en_panol is
  'true = pieza stockeada en el panol (cuenta en inventario, recuentos y exactitud). false = pieza que se compra contra la OT; solo se puede elegir al pedir.';

-- Las piezas de service que ya se vienen comprando, con el nombre normalizado.
-- Frecuencia real en las OT: aceite 17, aire 16, gasoil 10, trampa de agua 8,
-- secador 4, aceite 15W40 4, refrigerante 2.
insert into public.mantenimiento_repuestos (nombre, unidad, stock_actual, stock_min, en_panol)
select v.nombre, v.unidad, 0, 0, false
from (values
  ('Filtro de aceite',        'un'),
  ('Filtro de aire',          'un'),
  ('Filtro de gasoil',        'un'),
  ('Filtro trampa de agua',   'un'),
  ('Filtro secador de aire',  'un'),
  ('Aceite de motor 15W40',   'lt'),
  ('Liquido refrigerante',    'lt')
) as v(nombre, unidad)
where not exists (
  select 1 from public.mantenimiento_repuestos r where lower(r.nombre) = lower(v.nombre)
);

-- ---------------------------------------------------------------------
-- 2) El pedido
-- ---------------------------------------------------------------------
create table if not exists public.mantenimiento_pedidos (
  id uuid primary key default gen_random_uuid(),
  -- Opcionales los dos: una reposicion de panol no es de ninguna unidad ni OT.
  dominio text,
  ot_id uuid references public.mantenimiento_realizados(id) on delete set null,
  fecha date not null default current_date,          -- cuando se detecta la falta
  fecha_compra date,                                  -- cuando se compra
  fecha_retiro date,                                  -- cuando se retira (cierra)
  proveedor text,
  prioridad text not null default 'media' check (prioridad in ('baja','media','alta')),
  estado text not null default 'abierto' check (estado in ('abierto','comprado','retirado','anulado')),
  monto numeric(12,2) check (monto >= 0),
  descripcion text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mant_pedidos_estado on public.mantenimiento_pedidos (estado, fecha desc);
create index if not exists idx_mant_pedidos_ot on public.mantenimiento_pedidos (ot_id) where ot_id is not null;

comment on table public.mantenimiento_pedidos is
  'Pedido de repuestos: que falta, para que unidad/OT, a quien se compra, cuando se compra y cuando se retira. Los dias entre fecha y fecha_retiro son el tiempo que el trabajo estuvo esperando la pieza (PI de R2.3.3).';

-- ---------------------------------------------------------------------
-- 3) Las piezas del pedido
-- ---------------------------------------------------------------------
-- `repuesto_id` apunta al catalogo (es lo que permite contar "esta pieza falto
-- 3 veces este trimestre" y corregir el minimo). `descripcion` queda solo para
-- lo que todavia no esta en el catalogo.
create table if not exists public.mantenimiento_pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.mantenimiento_pedidos(id) on delete cascade,
  repuesto_id uuid references public.mantenimiento_repuestos(id) on delete set null,
  descripcion text,
  cantidad numeric(12,2) not null default 1 check (cantidad > 0),
  created_at timestamptz not null default now(),
  constraint mant_pedido_items_algo check (repuesto_id is not null or descripcion is not null)
);

create index if not exists idx_mant_pedido_items_pedido on public.mantenimiento_pedido_items (pedido_id);
create index if not exists idx_mant_pedido_items_repuesto on public.mantenimiento_pedido_items (repuesto_id) where repuesto_id is not null;

-- ---------------------------------------------------------------------
-- 4) RLS: igual que el resto del modulo
-- ---------------------------------------------------------------------
alter table public.mantenimiento_pedidos enable row level security;
alter table public.mantenimiento_pedido_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['mantenimiento_pedidos','mantenimiento_pedido_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = any (array['admin','supervisor'])))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = any (array['admin','supervisor'])))
    $f$, t || '_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) La unica orden de compra cargada se muda, para no perderla
-- ---------------------------------------------------------------------
insert into public.mantenimiento_pedidos
  (fecha, fecha_compra, proveedor, estado, monto, descripcion, created_by, created_at)
select oc.fecha, oc.fecha, oc.proveedor,
       case when oc.estado = 'comprada' then 'retirado' when oc.estado = 'anulada' then 'anulado' else 'abierto' end,
       oc.monto,
       coalesce(oc.descripcion, '') ||
         case when oc.numero is null then '' else ' (OC N° ' || oc.numero || ')' end,
       oc.created_by, oc.created_at
from public.mantenimiento_ordenes_compra oc
where not exists (
  select 1 from public.mantenimiento_pedidos p
  where p.proveedor is not distinct from oc.proveedor and p.fecha = oc.fecha
);

-- Verificacion.
select
  (select count(*) from public.mantenimiento_pedidos)                         as pedidos,
  (select count(*) from public.mantenimiento_repuestos where en_panol)        as piezas_panol,
  (select count(*) from public.mantenimiento_repuestos where not en_panol)    as piezas_compra;
