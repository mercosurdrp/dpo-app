-- Agregación en Postgres para la Priorización de Entrega.
--
-- Antes: el código traía `rechazos` y `nps_rmd_cliente` ENTEROS de a 1.000 filas
-- (7 y 12 requests HTTP en serie) y agrupaba en JavaScript.
--
-- 🚨 Devuelven un ÚNICO jsonb (no un conjunto de filas): así el resultado NO queda
-- sujeto al techo de 1.000 filas que PostgREST aplica a las RPC set-returning
-- (con `Range` NO se puede paginar: devuelve siempre las primeras 1.000). Un jsonb
-- escalar viene completo en un solo request.

-- Una versión previa devolvía filas (setof); ahora devuelven jsonb. Postgres no deja
-- cambiar el tipo de retorno con `create or replace`, así que primero se borran.
drop function if exists rechazos_culpa_cliente(date, date);
drop function if exists rmd_promedio_cliente(date);

-- ── Rechazos POR CAUSA DEL CLIENTE, agregados por cliente ─────────────────────
-- `rechazos` tiene UNA FILA POR ARTÍCULO ⇒ se juntan las líneas por ENTREGA
-- (id_cliente, serie, nrodoc) y el motivo de la entrega es el PREDOMINANTE (mode()).
-- Solo cuentan los motivos por culpa del cliente (sin dinero/cerrado=1, sin envases=0,5).
-- Devuelve { "<id_cliente>": { eventos, pesados, motivos }, ... }.
create or replace function rechazos_culpa_cliente(desde date, hasta date)
returns jsonb
language sql
stable
as $$
  with entregas as (
    select r.id_cliente,
           mode() within group (order by upper(trim(r.ds_rechazo))) as motivo
    from rechazos r
    where r.fecha >= desde and r.fecha <= hasta
    group by r.id_cliente, r.serie, r.nrodoc
  ),
  por_motivo as (
    select e.id_cliente, e.motivo,
           count(*) as cnt,
           count(*) * (case e.motivo when 'SIN ENVASES' then 0.5 else 1 end) as peso_sum
    from entregas e
    where e.motivo in ('SIN DINERO', 'CERRADO', 'SIN ENVASES')
    group by e.id_cliente, e.motivo
  ),
  agg as (
    select pm.id_cliente,
           sum(pm.cnt)::int      as eventos,
           sum(pm.peso_sum)::numeric as pesados,
           string_agg(pm.motivo || '×' || pm.cnt, ', ' order by pm.cnt desc) as motivos
    from por_motivo pm
    group by pm.id_cliente
  )
  select coalesce(
    jsonb_object_agg(id_cliente::text,
      jsonb_build_object('eventos', eventos, 'pesados', pesados, 'motivos', motivos)),
    '{}'::jsonb)
  from agg;
$$;

-- ── RMD promedio por cliente (bandera informativa) ───────────────────────────
-- Devuelve { "<cod_cliente>": { prom, n }, ... }.
create or replace function rmd_promedio_cliente(desde date)
returns jsonb
language sql
stable
as $$
  with agg as (
    select cod_cliente, avg(puntuacion)::numeric as prom, count(*)::int as n
    from nps_rmd_cliente
    where fecha_puntuacion >= desde
    group by cod_cliente
  )
  select coalesce(
    jsonb_object_agg(cod_cliente::text, jsonb_build_object('prom', prom, 'n', n)),
    '{}'::jsonb)
  from agg;
$$;
