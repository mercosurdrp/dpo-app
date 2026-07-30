-- WNP: las ausencias que descuentan horas del denominador salen de DOS lugares.
-- Hasta ahora este RPC solo miraba `ausentismo_eventos` (carga de RRHH en
-- /ausentismo), pero el día a día se carga como novedad en /asistencia
-- (`asistencia_novedades`: vacaciones, licencia médica, ausente, Pergamino).
-- Sin esa fuente, a la persona de vacaciones se le imputaba la jornada teórica
-- (8 hs L-V) y el denominador quedaba inflado ⇒ WNP subestimado.
-- Espejo de src/lib/wnp/datos.ts. Las novedades son de UN día: se devuelven con
-- desde = hasta = fecha, el formato que DepositoDashboard/api/index.py expande.
-- Solo Pampeana (el RPC lo consume el tablero del depósito).
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
        SELECT fecha, ROUND(SUM(total_hl)::numeric, 4) AS hl
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
