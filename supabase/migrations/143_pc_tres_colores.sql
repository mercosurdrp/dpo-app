-- 143_pc_tres_colores.sql
-- DPO 3.4: la escala del calendario queda en tres colores.
--
--   ROJO     CRITICO  — el volumen del día supera la capacidad de distribución,
--                       con o sin clientes/rechazo/ausentismo en alerta.
--   AMARILLO ATENCION — no supera el volumen, pero cruza alguna de contexto.
--   VERDE    NORMAL   — ni volumen ni contexto.
--
-- Se elimina el escalón CRITICO_ALTO ("CRÍTICO +") que distinguía al día
-- crítico con contexto: el contexto se sigue viendo en el detalle del día,
-- pero no cambia el color. Pedido por Sebastián el 03/09/2026.

begin;

delete from pc_planes_accion where codigo = 'CRITICO_ALTO';

insert into pc_planes_accion (codigo, descripcion, plan_texto) values
  ('CRITICO',
   'Crítico — el volumen supera la capacidad de distribución',
   E'Día que no entra en la flota con la ocupación normal.\n• Acumular volumen en los días previos: adelantar pedidos grandes y paletazos para bajar los HL del día.\n• Revisar y priorizar el ruteo con anticipación; reforzar con camión adicional o segunda vuelta si hace falta.\n• Cubrir ausencias del sector de entrega; si además hay clientes, rechazo o ausentismo en alerta, máxima dotación y no otorgar francos.\n• Coordinación previa con Ventas y seguimiento del avance de carga durante el día.\n• Comunicar a los clientes posibles demoras.')
on conflict (codigo) do update
  set descripcion = excluded.descripcion,
      plan_texto  = excluded.plan_texto,
      updated_at  = now();

commit;
