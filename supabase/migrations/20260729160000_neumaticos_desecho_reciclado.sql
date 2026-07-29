-- Bandeja de desecho: la cubierta que ya no sirve ni para recapar.
--
-- Hasta ahora "dar de baja" era instantáneo: la cubierta desaparecía de la
-- pantalla en el mismo acto y no quedaba el paso intermedio, que en el patio SÍ
-- existe — la goma se apila hasta que pasa la recicladora a llevarse la tanda.
-- Tampoco quedaba el comprobante de esa entrega.
--
-- El retiro se registra en `mantenimiento_residuos`, la tabla de disposición de
-- residuos que ya existía en el módulo (con su certificado de descarte y el
-- campo `numeros_fuego`, pensado justamente para los números de las cubiertas)
-- y que estaba SIN USAR. Así el retiro sirve de dos cosas a la vez: da de baja
-- las cubiertas y deja la evidencia ambiental del pilar.
--
-- Solo Pampeana: en Misiones no existe el módulo de neumáticos.

-- `para_desecho` = ya no sirve, espera en el depósito a que la retiren.
alter table mantenimiento_neumaticos
  drop constraint if exists mantenimiento_neumaticos_estado_check;

alter table mantenimiento_neumaticos
  add constraint mantenimiento_neumaticos_estado_check
  check (estado in (
    'stock', 'para_recapar', 'en_recapado', 'para_desecho', 'instalado', 'baja'
  ));

-- Con qué retiro se fue (null = baja administrativa, sin remito de retiro).
alter table mantenimiento_neumaticos
  add column if not exists residuo_id uuid
    references mantenimiento_residuos(id) on delete set null;

create index if not exists mant_neu_residuo_idx
  on mantenimiento_neumaticos (residuo_id);

-- El retiro también es un movimiento de la cubierta.
alter table mantenimiento_neumatico_movimientos
  drop constraint if exists mantenimiento_neumatico_movimientos_tipo_check;

alter table mantenimiento_neumatico_movimientos
  add constraint mantenimiento_neumatico_movimientos_tipo_check
  check (tipo in (
    'montaje', 'desmontaje', 'baja',
    'envio_recapado', 'retorno_recapado', 'retiro_reciclado'
  ));
