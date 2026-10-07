-- =====================================================================
-- Frecuencia declarada del recuento fisico de panol (DPO Flota 2.3 / R2.3.2)
-- =====================================================================
--
-- POR QUE: R2.3.2 pide "dias deseados de stock definidos y frecuencia de
-- recuento de stock definida", y el verificador lo chequea de forma explicita.
-- Los dias de stock ya tenian columna (`mantenimiento_repuestos.dias_stock`,
-- 17/07/2026) pero la frecuencia no vivia en ningun lado: habia dos recuentos
-- -08/08 y 26/09- y nada que dijera cada cuanto se supone que se hacen, asi que
-- no habia forma de saber si la rutina se cumplia o no.
--
-- Va en `mantenimiento_config`, que es la fila unica de parametros del modulo
-- (ahi ya vive `rotacion_km`). Default 30 dias: el panol son 19 piezas y se
-- cuenta en quince minutos, asi que mensual es lo que la operacion sostiene y
-- lo que el Gestor de Flota definio el 07/10/2026.
-- =====================================================================

alter table public.mantenimiento_config
  add column if not exists recuento_frecuencia_dias integer
    check (recuento_frecuencia_dias is null or recuento_frecuencia_dias > 0);

update public.mantenimiento_config
  set recuento_frecuencia_dias = 30
  where recuento_frecuencia_dias is null;

comment on column public.mantenimiento_config.recuento_frecuencia_dias is
  'Cada cuantos dias se hace el recuento fisico del panol. Lo exige R2.3.2 y es contra lo que se mide si el recuento esta vencido.';

-- Verificacion.
select recuento_frecuencia_dias from public.mantenimiento_config;
