-- Costo logístico por Punto de Venta (cost-to-serve) — Pampeana.
-- Reparte el costo mensual de los sectores DISTRIBUCIÓN y ALMACÉN entre cada
-- cliente/PDV usando como base la tabla `ventas_diarias_cliente`.
--
-- Modelo de dos pools (por mes):
--   Costo_Almacen(PDV)      = Almacen_mes   * (bultos_PDV / bultos_total_mes)
--   Costo_Distribucion(PDV) = Distrib_mes * [ w_rodaje*(bultos_PDV/bultos_tot)
--                                           + (1-w_rodaje)*(comprob_PDV/comprob_tot) ]
--   Almacén  -> se reparte por VOLUMEN (bultos).
--   Distrib. -> RODAJE (bultos) + PARADA (comprobantes = nº de entregas).

-- ---------------------------------------------------------------------------
-- 1) Tabla de costos mensuales por sector (los dos totales + el split editable)
-- ---------------------------------------------------------------------------
create table if not exists costo_logistico_mensual (
  anio          int     not null,
  mes           int     not null check (mes between 1 and 12),
  distribucion  numeric(16,2) not null default 0,
  almacen       numeric(16,2) not null default 0,
  w_rodaje      numeric(4,3)  not null default 0.65 check (w_rodaje between 0 and 1),
  updated_at    timestamptz   not null default now(),
  updated_by    uuid references profiles(id),
  primary key (anio, mes)
);

alter table costo_logistico_mensual enable row level security;

-- Lectura: cualquier usuario autenticado
drop policy if exists costo_logistico_mensual_select on costo_logistico_mensual;
create policy costo_logistico_mensual_select
  on costo_logistico_mensual for select to authenticated using (true);

-- Alta/edición/borrado: solo roles de gestión
drop policy if exists costo_logistico_mensual_insert on costo_logistico_mensual;
create policy costo_logistico_mensual_insert
  on costo_logistico_mensual for insert to authenticated
  with check (exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','supervisor','admin_rrhh')
  ));

drop policy if exists costo_logistico_mensual_update on costo_logistico_mensual;
create policy costo_logistico_mensual_update
  on costo_logistico_mensual for update to authenticated
  using (exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','supervisor','admin_rrhh')
  ));

drop policy if exists costo_logistico_mensual_delete on costo_logistico_mensual;
create policy costo_logistico_mensual_delete
  on costo_logistico_mensual for delete to authenticated
  using (exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','supervisor','admin_rrhh')
  ));

-- ---------------------------------------------------------------------------
-- 2) Función de cálculo: costo logístico por PDV para un (año, mes)
-- ---------------------------------------------------------------------------
create or replace function get_costo_por_pdv(p_anio int, p_mes int)
returns table (
  id_cliente     int,
  nombre_cliente text,
  bultos         numeric,
  comprobantes   int,
  hl             numeric,
  venta_neta     numeric,
  costo_almacen  numeric,
  costo_distrib  numeric,
  costo_total    numeric,
  costo_x_bulto  numeric,
  costo_x_hl     numeric,
  pct_venta      numeric
)
language sql
stable
security invoker
as $$
  with costo as (
    select distribucion, almacen, w_rodaje
    from costo_logistico_mensual
    where anio = p_anio and mes = p_mes
  ),
  base as (
    select v.id_cliente,
           max(v.nombre_cliente) as nombre_cliente,
           sum(v.bultos)::numeric        as bultos,
           sum(v.comprobantes)::int      as comprobantes,
           sum(v.hl)::numeric            as hl,
           sum(v.monto_neto)::numeric    as venta_neta
    from ventas_diarias_cliente v
    where v.fecha >= make_date(p_anio, p_mes, 1)
      and v.fecha <  (make_date(p_anio, p_mes, 1) + interval '1 month')
      and v.origen in ('chess','gestion')
    group by v.id_cliente
  ),
  tot as (
    select sum(bultos) as b_tot, sum(comprobantes) as c_tot from base
  ),
  calc as (
    select b.*,
           (select almacen from costo) * b.bultos / nullif((select b_tot from tot),0) as costo_almacen,
           (select distribucion from costo) * (
               (select w_rodaje from costo)        * b.bultos       / nullif((select b_tot from tot),0)
             + (1 - (select w_rodaje from costo))  * b.comprobantes / nullif((select c_tot from tot),0)
           ) as costo_distrib
    from base b
  )
  select
    id_cliente,
    nombre_cliente,
    round(bultos,1)                                   as bultos,
    comprobantes,
    round(hl,1)                                       as hl,
    round(venta_neta,2)                               as venta_neta,
    round(coalesce(costo_almacen,0),2)                as costo_almacen,
    round(coalesce(costo_distrib,0),2)                as costo_distrib,
    round(coalesce(costo_almacen,0)+coalesce(costo_distrib,0),2) as costo_total,
    round((coalesce(costo_almacen,0)+coalesce(costo_distrib,0)) / nullif(bultos,0),2) as costo_x_bulto,
    round((coalesce(costo_almacen,0)+coalesce(costo_distrib,0)) / nullif(hl,0),2)     as costo_x_hl,
    round(100*(coalesce(costo_almacen,0)+coalesce(costo_distrib,0)) / nullif(venta_neta,0),2) as pct_venta
  from calc
  order by costo_total desc;
$$;

grant execute on function get_costo_por_pdv(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Seed de costos ene–may 2026 (cargados por Leonardo). Editables luego en la app.
-- ---------------------------------------------------------------------------
insert into costo_logistico_mensual (anio, mes, distribucion, almacen) values
  (2026, 1, 103779960, 39433888),
  (2026, 2,  88559544, 33676481),
  (2026, 3,  87402895, 29480959),
  (2026, 4,  87402895, 29480959),
  (2026, 5,  75236934, 17243981)
on conflict (anio, mes) do nothing;
