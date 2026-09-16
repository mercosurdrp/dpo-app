-- ============================================================================
-- FIX puntual: OT 1766 (AE908DH) quedó "fuera de servicio" para siempre
-- ----------------------------------------------------------------------------
-- La OT está en estado `completado`, pero se guardó con `entrada_taller`
-- (03/09 14:55) y SIN `salida_taller`, así que `fuera_servicio_hasta` quedó en
-- NULL. Todo lo que calcula "fuera de servicio hoy" lee "OT no cancelada cuyo
-- rango incluye hoy" y NULL significa "sigue en el taller" — el estado
-- `completado` no se mira. Resultado: el DH figura en taller desde el 03/09
-- aunque salió a ruta todos los días (16/09: 144.835 km, checklist a las 09:57).
--
-- La parada real fue el 27 y 28/08, por odómetro:
--   * la OT trae odómetro 143.185 = el egreso del 27/08 07:19
--   * el 28/08 no tiene ningún registro
--   * la liberación del 29/08 marca los MISMOS 143.185 → no movió un km
--   * el 03/09 el DH trabajó (egreso 07:15, retorno 16:27); el "14:55" es la
--     hora de la foto de WhatsApp que se adjuntó a la OT, no una entrada al taller.
--
-- La 1765 ya toma el 27/08 de 09:00 a 12:00, así que esta arranca a las 12:00.
-- Las columnas son timestamptz: se escribe con offset -03:00 explícito.
-- ============================================================================

update mantenimiento_realizados
set entrada_taller       = '2026-08-27T12:00:00-03:00',
    salida_taller        = '2026-08-28T18:00:00-03:00',
    fuera_servicio_desde = '2026-08-27',
    fuera_servicio_hasta = '2026-08-28',
    updated_at           = now()
where id = 'cb9529f2-1aef-44c1-8c05-e747c563c51d';   -- OT 1766, AE908DH

-- Verificación 1: la OT quedó con el rango cerrado.
select numero_ot, dominio, fecha, estado,
       entrada_taller, salida_taller,
       fuera_servicio_desde, fuera_servicio_hasta
from mantenimiento_realizados
where id = 'cb9529f2-1aef-44c1-8c05-e747c563c51d';

-- Verificación 2: no debe quedar NINGUNA OT con el fuera de servicio abierto
-- (antes de correr esto, la única de toda la flota era la 1766).
select numero_ot, dominio, fecha, estado, fuera_servicio_desde
from mantenimiento_realizados
where estado <> 'cancelado'
  and fuera_servicio_desde is not null
  and fuera_servicio_hasta is null
  and fuera_servicio_desde <= current_date
order by fuera_servicio_desde;
