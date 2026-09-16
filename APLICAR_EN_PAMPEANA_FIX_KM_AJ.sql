-- ============================================================================
-- FIX: los km del AC165AJ (AJ) — cinco registros mal cargados
-- ----------------------------------------------------------------------------
-- Sin BEGIN/COMMIT y sin UNION a propósito: son 6 sentencias sueltas. Si el
-- editor se queja de alguna, corré las de arriba una por una (cada una es
-- independiente de las demás).
--
-- Qué pasó:
--   1. El 14/09 el egreso entró con 171.289 en lugar de 161.289 (un 7 por el 6).
--   2. El validador NO deja cargar una lectura menor a la anterior, así que el
--      que hizo el checklist quedó obligado a seguir tipeando 17x.xxx y el error
--      se arrastró tres lecturas más.
--   3. El egreso del 15/09 del AJ se cargó con el km correcto (161.476) pero en
--      el camión equivocado: quedó como OJA403, que anda por 426.xxx.
--
-- El AJ está hoy en 161.672 km.
-- ============================================================================

-- 1) Las cuatro lecturas con el dígito de más
update registros_vehiculos set odometro = 161289
where id = '5f4b78e4-b12d-4c35-b643-7ca45c41e934';

update checklist_vehiculos set odometro = 161383
where id = '1dbd29c8-4077-4146-81a8-d11744fc0468';

update checklist_vehiculos set odometro = 161476
where id = '7fef6de8-ab13-4ef1-8bbb-7c6b0405e680';

update checklist_vehiculos set odometro = 161672
where id = '75b719dc-7c42-4ee3-852e-c01d7654ad78';

-- 2) El egreso del 15/09 que quedó en el camión equivocado
update registros_vehiculos set dominio = 'AC165AJ'
where id = '69ced801-dfa8-4a04-8177-929743fa7fa8';

-- 3) OT 1769 (rotación + alineación del 04/09): el km no puede ser 161.289.
--    La lectura del 07/09 —tres días después— marca 161.207, así que el odómetro
--    iría para atrás. Se usa 161.207 en los 11 lugares donde viaja ese número.
update mantenimiento_realizados set odometro = 161207, updated_at = now()
where id = '4d861ad1-03de-4ad6-9571-37c7c814f959';

update mantenimiento_rotaciones set km = 161207
where ot_id = '4d861ad1-03de-4ad6-9571-37c7c814f959';

update mantenimiento_alineaciones set km = 161207
where ot_id = '4d861ad1-03de-4ad6-9571-37c7c814f959';

update mantenimiento_neumatico_movimientos set km = 161207
where dominio = 'AC165AJ' and fecha = '2026-09-04' and observaciones = 'Rotación OT #1769';


-- ============================================================================
-- VERIFICACIONES — correlas una por una
-- ============================================================================

-- A) Las lecturas de los registros del AJ
select fecha, odometro, tipo
from registros_vehiculos
where dominio = 'AC165AJ' and fecha >= '2026-08-28'
order by fecha;

-- B) Las lecturas de los checklists del AJ: tienen que subir sin escalones
--    (161.207 -> 161.287 -> 161.289 -> 161.383 -> 161.476 -> 161.672)
select fecha, odometro, tipo
from checklist_vehiculos
where dominio = 'AC165AJ' and fecha >= '2026-08-28'
order by fecha, hora;

-- C) El OJA403 no tiene que tener más la lectura de 161.476
select fecha, odometro, tipo
from registros_vehiculos
where dominio = 'OJA403' and fecha >= '2026-09-10'
order by fecha;

-- D) El km de la OT 1769
select numero_ot, fecha, odometro from mantenimiento_realizados
where id = '4d861ad1-03de-4ad6-9571-37c7c814f959';

-- E) Los 8 movimientos + rotación + alineación de esa OT (todos 161.207)
select numero, posicion, tipo, km from mantenimiento_neumatico_movimientos
where dominio = 'AC165AJ' and fecha = '2026-09-04';

select 'rotacion' as que, km from mantenimiento_rotaciones
where ot_id = '4d861ad1-03de-4ad6-9571-37c7c814f959';

select 'alineacion' as que, km from mantenimiento_alineaciones
where ot_id = '4d861ad1-03de-4ad6-9571-37c7c814f959';
