-- 150: Suma 'proactivo' como tercer tipo de mantenimiento (además de preventivo/correctivo).
alter table mantenimiento_realizados
  drop constraint if exists mantenimiento_realizados_tipo_check;
alter table mantenimiento_realizados
  add constraint mantenimiento_realizados_tipo_check
  check (tipo in ('preventivo', 'correctivo', 'proactivo'));
