-- ============================================================================
-- OT 1772 — AE591EI (EI) — 15/09/2026 — cambio de las 4 cubiertas traseras
-- ----------------------------------------------------------------------------
-- Lo que pasó:
--   * Salen las 4 recapadas PIRELLI R1 del eje de tracción:
--       27R (2IE) y 28R (2II)   -> a bodega, para enviar a recapar  [para_recapar]
--       29R (2DI) y 1131R (2DE) -> a la desechadora                 [para_desecho]
--   * Entran 4 Dayton nuevas 275/80R22.5, numeración de fuego 80, 81, 82 y 83,
--     15 mm de profundidad y 120 psi.
--   * Cubiertas compradas en Marsilli Neumáticos: $1.847.933 (las 4)
--   * Colocación en Pozzi: mano de obra $100.000
--   * Total de la OT: $1.947.933
--
-- Decisiones que tomé y conviene mirar antes de correr:
--   1. Las cubiertas del EI están cargadas con el sufijo R (27R, 28R, 29R,
--      1131R) porque son recapadas. El "1131" sin R es otra cubierta: es el
--      auxilio del KY, y NO se toca.
--   2. Km: 125.009, el dato que pasó él (el odómetro al momento del cambio).
--      No hay lectura cargada del 15/09: la anterior es del 12/09 con 124.994 y
--      la siguiente del 16/09 con 125.012, así que 125.009 encaja entre las dos.
--   3. "15 cm de profundidad" se cargó como 15 mm (una cubierta nueva de esta
--      medida trae 15-16 mm).
--   4. Posiciones de las nuevas: 80 -> 2DE, 81 -> 2DI, 82 -> 2IE, 83 -> 2II.
--      Si en el camión quedaron en otro orden, cambiá las posiciones acá abajo.
--   5. Entrada/salida de taller: VACÍAS. El camión fue a la gomería y volvió, no
--      estuvo fuera de servicio, así que la OT no le descuenta disponibilidad.
--   6. Las dos cubiertas que fueron a la desechadora quedan en `para_desecho`.
--      El retiro en sí (con el certificado de disposición final y el nombre de
--      la desechadora) se registra en Residuos: eso es lo que las pasa a `baja`.
--   7. Números de factura: no los tengo. Cargá los dos números y los PDF desde
--      la app cuando los tengas (acordate de refrescar la página primero).
-- ============================================================================

begin;

-- ---------- 1) La orden de trabajo ----------
insert into mantenimiento_realizados (
  id, dominio, fecha, tipo, estado, rubro, taller, numero_ot,
  odometro, costo, costo_mano_obra, es_service_general, origen, observaciones, created_by
) values (
  'f642d349-10b0-4c91-b783-b6ff158b40ef', 'AE591EI', '2026-09-15', 'preventivo',
  'completado', 'neumaticos', 'Pozzi', '1772',
  125009, 1947933, 100000, false, 'manual',
  'Cambio de las 4 cubiertas del eje de tracción. Salen las recapadas PIRELLI R1: 27R (2IE) y 28R (2II) a bodega para recapar, 29R (2DI) y 1131R (2DE) a la desechadora. Entran 4 Dayton nuevas 275/80R22.5 con numeración de fuego 80, 81, 82 y 83, 15 mm de profundidad, infladas a 120 psi. Cubiertas compradas en Marsilli Neumaticos ($1.847.933); colocación en Pozzi (mano de obra $100.000).',
  'e681193d-812e-4c16-82bc-19220b20bd21'
);

insert into mantenimiento_realizado_tareas (mantenimiento_id, descripcion, auto) values
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Cambio de las 4 cubiertas del eje de tracción', false);

-- ---------- 2) La plata: dos comprobantes y el desglose ----------
insert into mantenimiento_realizado_facturas (mantenimiento_id, proveedor, monto_total, orden) values
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Marsilli Neumaticos', 1847933, 0),
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Pozzi',                100000, 1);

-- Las 4 cubiertas como repuestos comprados (no salen del pañol), para que el
-- desglose cierre contra los comprobantes: 1.847.933 + 100.000 de mano de obra.
insert into mantenimiento_realizado_repuestos (mantenimiento_id, descripcion, cantidad, costo_unitario) values
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Cubierta Dayton 275/80R22.5 N° 80', 1, 461983.25),
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Cubierta Dayton 275/80R22.5 N° 81', 1, 461983.25),
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Cubierta Dayton 275/80R22.5 N° 82', 1, 461983.25),
  ('f642d349-10b0-4c91-b783-b6ff158b40ef', 'Cubierta Dayton 275/80R22.5 N° 83', 1, 461983.25);

-- ---------- 3) Las 4 que salen ----------
-- Al desmontar se limpia unidad, posición, eje y fecha de instalación: la
-- cubierta deja de estar en el camión y pasa a su estado de destino.
update mantenimiento_neumaticos
set dominio = null, posicion = null, eje = null, fecha_instalacion = null,
    estado = 'para_recapar', updated_at = now(),
    observaciones = coalesce(observaciones, '') || ' Desmontada del AE591EI el 15/09/2026 @ 125.009 km (OT #1772). En bodega, para enviar a recapar.'
where id in (
  '69b36634-c96a-44b2-bac3-f1af08acc863',   -- 27R, estaba en 2IE
  '6bf19a2e-d509-4ec5-a837-ca267f76a9ad'    -- 28R, estaba en 2II
);

update mantenimiento_neumaticos
set dominio = null, posicion = null, eje = null, fecha_instalacion = null,
    estado = 'para_desecho', updated_at = now(),
    observaciones = coalesce(observaciones, '') || ' Desmontada del AE591EI el 15/09/2026 @ 125.009 km (OT #1772). Enviada a la desechadora; falta registrar el retiro en Residuos con el certificado de disposición final.'
where id in (
  'da2bb2aa-36e5-4445-ac4b-be0de8bed24e',   -- 29R,   estaba en 2DI
  '63af129f-7199-4bd9-a031-327c0a3a7c91'    -- 1131R, estaba en 2DE
);

insert into mantenimiento_neumatico_movimientos
  (neumatico_id, tipo, dominio, posicion, eje, fecha, km, medida, numero, observaciones, created_by) values
  ('69b36634-c96a-44b2-bac3-f1af08acc863', 'desmontaje', 'AE591EI', '2IE', 'traccion', '2026-09-15', 125009, '275/80R22.5', '27R',   'Desmontada y enviada a recapar (OT #1772)', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('6bf19a2e-d509-4ec5-a837-ca267f76a9ad', 'desmontaje', 'AE591EI', '2II', 'traccion', '2026-09-15', 125009, '275/80R22.5', '28R',   'Desmontada y enviada a recapar (OT #1772)', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('da2bb2aa-36e5-4445-ac4b-be0de8bed24e', 'desmontaje', 'AE591EI', '2DI', 'traccion', '2026-09-15', 125009, '275/80R22.5', '29R',   'Desmontada para desecho (OT #1772)',       'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('63af129f-7199-4bd9-a031-327c0a3a7c91', 'desmontaje', 'AE591EI', '2DE', 'traccion', '2026-09-15', 125009, '275/80R22.5', '1131R', 'Desmontada para desecho (OT #1772)',       'e681193d-812e-4c16-82bc-19220b20bd21');

-- ---------- 4) Las 4 que entran ----------
insert into mantenimiento_neumaticos (
  id, numero, tipo, marca, medida, dominio, posicion, eje,
  profundidad_inicial_mm, profundidad_actual_mm, km_instalacion, estado,
  fecha_ingreso, fecha_instalacion, fecha_compra, proveedor, costo_unitario,
  vueltas_recapado, observaciones, created_by
) values
  ('dc340731-61a9-493b-bc2b-27b25d93463f', '80', 'nuevo', 'Dayton', '275/80R22.5', 'AE591EI', '2DE', 'traccion',
   15, 15, 125009, 'instalado', '2026-09-15', '2026-09-15', '2026-09-15', 'Marsilli Neumaticos', 461983.25, 0,
   'Compra Marsilli Neumaticos, colocada en Pozzi el 15/09/2026 (OT #1772). Reemplaza a la 1131R.', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('cb1807e6-60f3-47e8-ba3f-35ecc4c1c38d', '81', 'nuevo', 'Dayton', '275/80R22.5', 'AE591EI', '2DI', 'traccion',
   15, 15, 125009, 'instalado', '2026-09-15', '2026-09-15', '2026-09-15', 'Marsilli Neumaticos', 461983.25, 0,
   'Compra Marsilli Neumaticos, colocada en Pozzi el 15/09/2026 (OT #1772). Reemplaza a la 29R.', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('f88af699-a8cc-4ba5-b660-aad6e920fa1d', '82', 'nuevo', 'Dayton', '275/80R22.5', 'AE591EI', '2IE', 'traccion',
   15, 15, 125009, 'instalado', '2026-09-15', '2026-09-15', '2026-09-15', 'Marsilli Neumaticos', 461983.25, 0,
   'Compra Marsilli Neumaticos, colocada en Pozzi el 15/09/2026 (OT #1772). Reemplaza a la 27R.', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('5c1be8b4-197c-478d-a085-28f92dafbeb3', '83', 'nuevo', 'Dayton', '275/80R22.5', 'AE591EI', '2II', 'traccion',
   15, 15, 125009, 'instalado', '2026-09-15', '2026-09-15', '2026-09-15', 'Marsilli Neumaticos', 461983.25, 0,
   'Compra Marsilli Neumaticos, colocada en Pozzi el 15/09/2026 (OT #1772). Reemplaza a la 28R.', 'e681193d-812e-4c16-82bc-19220b20bd21');

insert into mantenimiento_neumatico_movimientos
  (neumatico_id, tipo, dominio, posicion, eje, fecha, km, medida, numero, observaciones, created_by) values
  ('dc340731-61a9-493b-bc2b-27b25d93463f', 'montaje', 'AE591EI', '2DE', 'traccion', '2026-09-15', 125009, '275/80R22.5', '80', 'Compra y colocación en el momento (no pasó por el stock). OT #1772', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('cb1807e6-60f3-47e8-ba3f-35ecc4c1c38d', 'montaje', 'AE591EI', '2DI', 'traccion', '2026-09-15', 125009, '275/80R22.5', '81', 'Compra y colocación en el momento (no pasó por el stock). OT #1772', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('f88af699-a8cc-4ba5-b660-aad6e920fa1d', 'montaje', 'AE591EI', '2IE', 'traccion', '2026-09-15', 125009, '275/80R22.5', '82', 'Compra y colocación en el momento (no pasó por el stock). OT #1772', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('5c1be8b4-197c-478d-a085-28f92dafbeb3', 'montaje', 'AE591EI', '2II', 'traccion', '2026-09-15', 125009, '275/80R22.5', '83', 'Compra y colocación en el momento (no pasó por el stock). OT #1772', 'e681193d-812e-4c16-82bc-19220b20bd21');

-- La profundidad y la presión del montaje entran como origen 'alta': son el dato
-- declarado de la cubierta nueva, NO una medición de ronda. Por eso el desgaste
-- por km no las usa como punto de arranque de tramo.
insert into mantenimiento_neumatico_mediciones
  (neumatico_id, fecha, profundidad_mm, presion_psi, km, nota, origen, created_by) values
  ('dc340731-61a9-493b-bc2b-27b25d93463f', '2026-09-15', 15, 120, 125009, 'Montaje', 'alta', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('cb1807e6-60f3-47e8-ba3f-35ecc4c1c38d', '2026-09-15', 15, 120, 125009, 'Montaje', 'alta', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('f88af699-a8cc-4ba5-b660-aad6e920fa1d', '2026-09-15', 15, 120, 125009, 'Montaje', 'alta', 'e681193d-812e-4c16-82bc-19220b20bd21'),
  ('5c1be8b4-197c-478d-a085-28f92dafbeb3', '2026-09-15', 15, 120, 125009, 'Montaje', 'alta', 'e681193d-812e-4c16-82bc-19220b20bd21');

commit;

-- ============================================================================
-- VERIFICACIONES
-- ============================================================================
-- 1) El EI tiene que quedar con 7 cubiertas instaladas: 74 y 75 adelante,
--    80-83 atrás y el auxilio 13290.
select numero, posicion, eje, marca, estado, profundidad_actual_mm, km_instalacion
from mantenimiento_neumaticos
where dominio = 'AE591EI' order by posicion;

-- 2) Las 4 que salieron, con su destino y sin unidad asignada.
select numero, estado, dominio, posicion, vueltas_recapado
from mantenimiento_neumaticos
where id in ('69b36634-c96a-44b2-bac3-f1af08acc863','6bf19a2e-d509-4ec5-a837-ca267f76a9ad',
             'da2bb2aa-36e5-4445-ac4b-be0de8bed24e','63af129f-7199-4bd9-a031-327c0a3a7c91');

-- 3) La OT, sus comprobantes y el desglose: 1.847.933 + 100.000 = 1.947.933.
select m.numero_ot, m.fecha, m.dominio, m.estado, m.rubro, m.odometro,
       m.costo, m.costo_mano_obra,
       (select sum(monto_total) from mantenimiento_realizado_facturas f where f.mantenimiento_id = m.id) as facturas,
       (select sum(cantidad * costo_unitario) from mantenimiento_realizado_repuestos r where r.mantenimiento_id = m.id) as repuestos
from mantenimiento_realizados m
where m.id = 'f642d349-10b0-4c91-b783-b6ff158b40ef';

-- 4) Los 8 movimientos de la jornada.
select fecha, tipo, numero, posicion, km
from mantenimiento_neumatico_movimientos
where fecha = '2026-09-15' and dominio = 'AE591EI' order by tipo, posicion;
