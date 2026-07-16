-- VRL por día. Hermana de v_vrl_mensual (20260714190000_entrega_cortes.sql), que
-- agrupa por 'YYYY-MM' y por eso no sirve para la ventana de 7 días del bloque
-- Flota y Ruteo de la reunión de logística de los lunes.
--
-- Va como vista y no como select directo a entrega_cortes porque esa tabla tiene
-- RLS con política sólo para service_role: un usuario autenticado que la consulte
-- recibe 0 filas SIN error, y el cuadro mostraría "no hubo reprogramado" cuando
-- en realidad no tuvo permiso. La vista corre con los permisos del owner.
create or replace view v_vrl_diario as
select
  fecha_entrega                          as fecha,
  count(*)                               as pedidos_reprogramados,
  count(distinct id_cliente)             as clientes,
  sum(bultos)                            as bultos,
  sum(hl)                                as hl,
  sum(monto)                             as monto
from entrega_cortes
group by 1
order by 1 desc;

comment on view v_vrl_diario is
  'VRL (volumen reprogramado logístico) agregado por día de entrega. Usado por el bloque Flota y Ruteo de la reunión de logística (ventana de 7 días).';
