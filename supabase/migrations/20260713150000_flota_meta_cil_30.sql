-- La meta de tareas CIL/ATO estaba en 20, puesta a ojo cuando no había ni un
-- registro. La rutina real de Pampeana son 11 camiones lavados por fuera cada 15
-- días (22/mes) más 2 autoelevadores lavados por semana (~9/mes) ≈ 30.
--
-- Solo cuenta la LIMPIEZA PROFUNDA: la limpieza diaria de cabina y caja que el
-- chofer hace al volver del reparto NO es una tarea ATO — el pilar (DPO 4.1)
-- exige que las tareas ATO sean incrementales a la lista de verificación diaria.
UPDATE flota_metas SET meta = 30, updated_at = now() WHERE kpi = 'cil_tareas';
