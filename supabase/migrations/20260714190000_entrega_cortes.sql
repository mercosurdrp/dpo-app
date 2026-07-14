-- VOLUMEN REPROGRAMADO LOGÍSTICO (VRL) + memoria de los cortes de entrega.
--
-- Dos cosas en una tabla:
--
-- 1) VRL: el volumen (BULTOS y HL) de los pedidos que se dejan afuera del ruteo por
--    falta de capacidad. Es una variable DISTINTA del "Volumen Reprogramado por
--    crédito" (ese mide pedidos trabados por límite de crédito, vive en Railway
--    `vol_reprog_pedido`). Misma unidad para que sean comparables: bultos + HL, con
--    HL = Σ cantBultos × valor_unidad_medida (HL por bulto, maestro `articulos`).
--    Se acumula por mes vía la vista `v_vrl_mensual`.
--
-- 2) MEMORIA DEL CORTE: sin registrar a quién se dejó afuera, el cliente chico o de
--    baja rotación queda último HOY, MAÑANA y SIEMPRE. Con esto el pedido ENVEJECE:
--    cada postergación previa le suma puntos en el ranking del día siguiente, y a las
--    2 veces pasa a INTOCABLE (entra sí o sí, no compite).

create table if not exists entrega_cortes (
  id             uuid primary key default gen_random_uuid(),
  fecha_entrega  date    not null,
  id_cliente     bigint  not null,
  nombre_cliente text,
  localidad      text,
  bultos         numeric not null default 0,
  hl             numeric not null default 0,
  monto          numeric not null default 0,
  score          numeric,
  posicion       integer,
  comportamiento numeric,
  cluster        text,
  veces_previas  integer not null default 0,
  motivo         text    not null default 'cupo',
  nota           text,
  cortado_por    text,
  created_at     timestamptz not null default now(),
  unique (fecha_entrega, id_cliente)
);

create index if not exists entrega_cortes_cliente_idx on entrega_cortes (id_cliente, fecha_entrega desc);
create index if not exists entrega_cortes_fecha_idx   on entrega_cortes (fecha_entrega desc);

alter table entrega_cortes enable row level security;

drop policy if exists entrega_cortes_service on entrega_cortes;
create policy entrega_cortes_service on entrega_cortes
  for all to service_role using (true) with check (true);

-- VRL acumulado por mes.
create or replace view v_vrl_mensual as
select
  to_char(fecha_entrega, 'YYYY-MM')      as anio_mes,
  count(*)                               as pedidos_reprogramados,
  count(distinct id_cliente)             as clientes,
  sum(bultos)                            as bultos,
  sum(hl)                                as hl,
  sum(monto)                             as monto
from entrega_cortes
group by 1
order by 1 desc;

comment on table entrega_cortes is
  'Volumen Reprogramado Logístico (VRL): pedidos dejados afuera del ruteo por falta de capacidad, en bultos y HL. Distinto del Volumen Reprogramado por crédito. Alimenta además el envejecimiento del score de priorización.';
