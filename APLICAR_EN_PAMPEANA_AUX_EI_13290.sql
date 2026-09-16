-- ============================================================================
-- Cubierta 13290: es Bridgestone, y salió del auxilio del EI el 15/09/2026
-- ----------------------------------------------------------------------------
--   * La marca estaba mal: figuraba Pirelli, la goma dice **Bridgestone**.
--   * Se desmontó del auxilio (AUX) del AE591EI el mismo día que se cambiaron
--     las 4 de tracción (OT 1772), a 125.009 km.
--   * Queda en **stock** (bodega): tiene 9,55 mm medidos el 26/08, así que sirve.
--     Si en realidad fue a recapar o a desecho, cambiá `estado` por
--     'para_recapar' o 'para_desecho'.
--   * El auxilio que tiene hoy el EI lo carga él aparte, cuando lo identifique:
--     hasta entonces la posición AUX del EI queda vacía.
-- ============================================================================


update mantenimiento_neumaticos
set marca = 'Bridgestone',
    dominio = null,
    posicion = null,
    eje = null,
    fecha_instalacion = null,
    estado = 'stock',
    observaciones = coalesce(observaciones, '') || ' Marca corregida a Bridgestone el 16/09/2026 (estaba cargada como Pirelli). Desmontada del auxilio del AE591EI el 15/09/2026 @ 125.009 km, el mismo día del cambio de las 4 de tracción (OT #1772). Queda en bodega.',
    updated_at = now()
where id = 'ae35f59b-0ac3-4a29-b86a-9d92e95bd2b2';   -- N° 13290

insert into mantenimiento_neumatico_movimientos
  (neumatico_id, tipo, dominio, posicion, eje, fecha, km, medida, numero, observaciones, created_by) values
  ('ae35f59b-0ac3-4a29-b86a-9d92e95bd2b2', 'desmontaje', 'AE591EI', 'AUX', null,
   '2026-09-15', 125009, '275/80R22.5', '13290', 'Desmontada al stock (OT #1772)',
   'e681193d-812e-4c16-82bc-19220b20bd21');


-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) La 13290 tiene que quedar Bridgestone, en stock y sin unidad.
select numero, marca, medida, dominio, posicion, estado, profundidad_actual_mm
from mantenimiento_neumaticos
where id = 'ae35f59b-0ac3-4a29-b86a-9d92e95bd2b2';

-- 2) El EI queda con 6 cubiertas de ruta (74, 75, 80, 81, 82, 83) y SIN auxilio,
--    hasta que se cargue la que tiene puesta hoy.
select numero, posicion, eje, marca, estado, profundidad_actual_mm
from mantenimiento_neumaticos
where dominio = 'AE591EI' order by posicion;
