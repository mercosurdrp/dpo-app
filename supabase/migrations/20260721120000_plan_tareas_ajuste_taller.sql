-- 20260721120000: Ajuste del plan preventivo según cómo se trabaja realmente en
-- el taller (Pampeana). Tres tipos de cambio:
--
--   1. Frecuencias reales: el aceite + filtros del camión van cada 20.000 km
--      (no 10.000) y los de la camioneta cada 10.000 (no 20.000).
--   2. Tareas que no se cuentan por km propio sino que caen CON el service:
--      engrase, regulación de frenos y la revisión de cardán/fluidos. Se les
--      pone la misma frecuencia que el aceite para que venzan juntas.
--   3. Salen del checklist de la OT las que ya se controlan en su propio módulo:
--      rotación de neumáticos y tren delantero (tab Neumáticos). Ojo: NO se
--      borran, se desactivan, porque `activo=false` las saca del checklist y del
--      plan pero conserva el historial de mantenimiento_realizado_tareas.
--
-- El puente OT → Neumáticos/Alineaciones (sincronizarNeumaticosDesdeOt) matchea
-- por TEXTO sobre tareas + observaciones, así que sigue funcionando: escribir
-- "rotación" en observaciones crea la rotación igual que antes.

begin;

-- ─────────────────────────── Camión ───────────────────────────

-- Aceite y engrase: el service del camión es cada 20.000 km.
update mantenimiento_plan_tareas
   set frecuencia_km = 20000, updated_at = now()
 where tipo_vehiculo = 'camion' and codigo in ('aceite_motor', 'engrase_general');

-- Refrigerante: pasa a ser por tiempo (cada 6 meses) e incluye la limpieza de
-- radiador, que se hace en el mismo momento.
update mantenimiento_plan_tareas
   set nombre           = 'Refrigerante: cambio de agua + limpieza de radiador',
       frecuencia_km    = null,
       frecuencia_meses = 6,
       updated_at       = now()
 where tipo_vehiculo = 'camion' and codigo = 'refrigerante';

-- Revisión de cardán y fluidos: se hace junto con el service.
insert into mantenimiento_plan_tareas
  (codigo, nombre, categoria, tipo_vehiculo, frecuencia_km, frecuencia_meses, orden)
values
  ('cardan_fluidos', 'Cardán y fluidos: revisión y control', 'general', 'camion', 20000, 6, 75)
on conflict (codigo, tipo_vehiculo) do nothing;

-- ───────────────────────── Camioneta ─────────────────────────

-- El service de la camioneta es cada 10.000 km: filtros y frenos van con él.
update mantenimiento_plan_tareas
   set frecuencia_km = 10000, updated_at = now()
 where tipo_vehiculo = 'camioneta'
   and codigo in ('filtro_combustible', 'filtro_aire', 'frenos');

-- ──────────────── Salen del checklist (ambos tipos) ────────────────

-- Rotación de neumáticos: se controla en el tab Neumáticos, que lleva su propio
-- contador de km desde la última rotación registrada.
update mantenimiento_plan_tareas
   set activo = false, updated_at = now()
 where codigo = 'neumaticos' and tipo_vehiculo in ('camion', 'camioneta');

-- Tren delantero: es una revisión que se hace junto con los neumáticos, no un
-- cambio con vencimiento propio.
update mantenimiento_plan_tareas
   set activo = false, updated_at = now()
 where codigo = 'tren_delantero' and tipo_vehiculo = 'camion';

commit;
