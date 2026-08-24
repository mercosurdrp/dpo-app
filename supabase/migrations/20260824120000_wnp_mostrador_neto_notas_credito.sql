-- WNP: el mostrador del numerador tiene que ir NETO de notas de crédito.
--
-- `ventas_mostrador_diarias` guarda los cuatro documentos en valor ABSOLUTO
-- (ver src/lib/sync/rechazos-sync.ts): FCVTA = mostrador físico, PRVTA =
-- factura presupuesto (fletero "SEGUNDA VUELTA", el grueso), DVVTA = notas de
-- crédito y PRDVO = devoluciones de presupuesto. El consumidor tiene que
-- restar las dos últimas — así lo hace la fila "facturado Chess" del cuadro
-- mensual (FCVTA + PRVTA − DVVTA − PRDVO).
--
-- Este RPC sumaba las cuatro en positivo, así que el WNP diario de
-- deposito-esteban contaba como producción la mercadería que volvió
-- (jul/26: +75 HL sobre 11.679; may/26: +106). Espejo de src/lib/wnp/datos.ts,
-- que se corrigió en el mismo cambio.
--
-- OJO: la tabla `rechazos` son estos mismos DVVTA (jul/26: 73,2 HL de los 76,9
-- de la tabla; el resto es DEV-RE). Restarlos acá YA descuenta los rechazos del
-- numerador: no hay que volver a restarlos aguas abajo o se cuenta dos veces.
--
-- Sólo cambia el bloque 'mostrador'; 'fichaje' y 'ausencias' quedan igual.
CREATE OR REPLACE FUNCTION public.get_wnp_insumos_diario()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'mostrador', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('fecha', fecha, 'hl', hl) ORDER BY fecha), '[]'::jsonb)
      FROM (
        SELECT fecha,
               ROUND(SUM(
                 CASE WHEN ds_documento IN ('DVVTA', 'PRDVO')
                      THEN -total_hl
                      ELSE total_hl
                 END
               )::numeric, 4) AS hl
        FROM public.ventas_mostrador_diarias
        GROUP BY fecha
      ) m
    ),
    'fichaje', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('fecha', fecha, 'legajo', legajo, 'horas', horas) ORDER BY fecha, legajo), '[]'::jsonb)
      FROM (
        SELECT fecha, legajo, ROUND(SUM(horas_trabajadas)::numeric, 2) AS horas
        FROM public.asistencia_resumen_diario
        WHERE legajo IN (30, 107, 110, 112, 135, 201, 36467481, 43907801, 425283564)
          AND horas_trabajadas > 0
        GROUP BY fecha, legajo
      ) f
    ),
    'ausencias', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('legajo', legajo, 'desde', desde, 'hasta', hasta)), '[]'::jsonb)
      FROM (
        -- (a) novedad diaria de /asistencia
        SELECT n.legajo, n.fecha AS desde, n.fecha AS hasta
        FROM public.asistencia_novedades n
        WHERE n.legajo IN (30, 107, 110, 112, 135, 201, 36467481, 43907801, 425283564)
        UNION ALL
        -- (b) evento de /ausentismo (rango)
        SELECT e.legajo, a.fecha_inicio AS desde, a.fecha_fin AS hasta
        FROM public.ausentismo_eventos a
        JOIN public.empleados e ON e.id = a.empleado_id
        WHERE e.legajo IN (30, 107, 110, 112, 135, 201, 36467481, 43907801, 425283564)
      ) au
    )
  );
$function$;
