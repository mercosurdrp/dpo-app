-- 20260721130000: Alarmas propias además del service.
--   autoelevador  aceite de caja 500 hs · aceite diferencial 1000 hs
--   camión        regulación de válvulas + bomba de agua + correa cada 100.000 km
-- Las tres del camión van en una sola alarma porque se hacen de una sentada.
insert into mantenimiento_plan_tareas
  (codigo, nombre, categoria, tipo_vehiculo, frecuencia_km, frecuencia_meses, frecuencia_horas, orden, activo)
values
  ('aceite_caja',        'Aceite de caja',     'motor', 'autoelevador', null, null,  500, 20, true),
  ('aceite_diferencial', 'Aceite diferencial', 'motor', 'autoelevador', null, null, 1000, 30, true),
  ('valvulas_bomba_correa', 'Regulación de válvulas + bomba de agua + correa',
                                               'motor', 'camion',     100000, null, null, 20, true)
on conflict (codigo, tipo_vehiculo) do update
  set nombre           = excluded.nombre,
      frecuencia_km    = excluded.frecuencia_km,
      frecuencia_meses = excluded.frecuencia_meses,
      frecuencia_horas = excluded.frecuencia_horas,
      activo           = true,
      orden            = excluded.orden,
      updated_at       = now();
