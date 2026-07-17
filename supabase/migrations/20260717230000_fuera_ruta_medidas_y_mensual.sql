-- Bultos y HL de cada pedido fuera de ruta + acumulado mensual.
--
-- El sheet casi nunca trae BULTOS (7/351) y nunca HL, pero el pedido existe en
-- Chess: mientras está pendiente sale de /pedidos/ (items cantBultos + maestro
-- articulos), y una vez facturado de /ventas/?detallado=true (cantidadesTotal;
-- verificado que unimedtotal = cantidadesTotal × valor_unidad_medida, 8/8).
-- `medida_origen` dice de dónde salió la medida: 'pedido' (pendiente, puede
-- cambiar) o 'venta' (facturado, definitivo).

alter table public.fuera_ruta_registros
  add column if not exists bultos_pedido numeric,
  add column if not exists hl_pedido numeric,
  add column if not exists medida_origen text;

-- Acumulado por mes de entrega. Misma forma que v_vrl_mensual para que la UI
-- los muestre lado a lado (el usuario quiere revisar meses anteriores de ambos).
create or replace view public.v_fuera_ruta_mensual as
select
  to_char(fecha_entrega, 'YYYY-MM') as anio_mes,
  count(*)::int as pedidos,
  count(distinct cod_cliente)::int as clientes,
  round(sum(coalesce(bultos_pedido, bultos, 0)), 2) as bultos,
  round(sum(coalesce(hl_pedido, 0)), 2) as hl,
  round(sum(coalesce(monto, 0)), 2) as monto
from public.fuera_ruta_registros
group by 1
order by 1 desc;
