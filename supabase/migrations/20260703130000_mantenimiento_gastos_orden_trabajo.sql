-- N° de orden de trabajo (OT) asociado al gasto, para seguimiento contra el
-- módulo de Órdenes de Trabajo. Obligatorio en la UI para tipo=factura.
alter table public.mantenimiento_gastos
  add column if not exists orden_trabajo text;
