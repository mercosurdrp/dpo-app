-- =============================================================================
-- CERRADO vs. horario relevado del PDV
-- =============================================================================
-- Abre el motivo CERRADO del Arbol del Sueno en dos mundos que hoy estan en la
-- misma bolsa: las veces que fuimos DENTRO del horario que el cliente declaro
-- (problema del cliente) y las que fuimos FUERA (problema nuestro, de ruteo).
--
-- Medido sobre 2026 antes de escribir una linea: de 420 veces de CERRADO, 173
-- fueron dentro de la ventana, 77 en la siesta de un horario partido, 18
-- temprano, 8 tarde y 2 un dia que el cliente no abre. Las 77 de la siesta son
-- el 73% de lo que es culpa nuestra, y se evitan resecuenciando.
--
-- Dos tablas:
--   pdv_horarios              replica del relevamiento trimestral que vive en
--                             la base del dashboard Mercosur (Railway). Se
--                             replica porque los rechazos y Foxtrot estan aca y
--                             cruzar dos bases no se puede hacer en una query.
--   cerrado_horario_analisis  una fila por VEZ de CERRADO (cliente x dia) ya
--                             clasificada. Materializada: la instancia es Micro
--                             y este cruce no se calcula en vivo.
--
-- Escribe solo el service_role (el cron); lee cualquier usuario logueado.
-- Solo Pampeana: el relevamiento de horarios es de esa unidad.

-- -----------------------------------------------------------------------------
-- 1. El horario relevado, tal como lo carga el promotor
-- -----------------------------------------------------------------------------
-- El JSON se guarda CRUDO, sin desarmarlo en columnas. Ya viene estructurado por
-- dia y con dos tramos, y desarmarlo a (id_cliente, dia_semana, abre, cierra)
-- son 7 filas por cliente y se pierde el segundo tramo, que es justamente el que
-- define la siesta. Forma:
--   {"lun": {"abre": true, "t1": ["08:00","13:00"], "t2": ["16:00","20:00"]},
--    "dom": {"abre": false, "t1": null, "t2": null}, ...}
-- Claves: lun mar mie jue vie sab dom.
CREATE TABLE IF NOT EXISTS pdv_horarios (
  id_cliente   BIGINT      NOT NULL,
  -- Trimestre del relevamiento: '2026-Q3'. Se guardan todos los ciclos, no solo
  -- el vigente: un rechazo de mayo se clasifica con la ventana que estaba
  -- relevada en mayo, no con la de hoy.
  ciclo        TEXT        NOT NULL,
  horario      JSONB       NOT NULL,
  -- corrido | partido | por_dia. El partido es el que puede tener siesta.
  modo_carga   TEXT,
  relevado_por TEXT,
  razon_social TEXT,
  fecha_carga  TIMESTAMPTZ,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_cliente, ciclo)
);

CREATE INDEX IF NOT EXISTS idx_pdv_horarios_ciclo
  ON pdv_horarios (ciclo, id_cliente);

ALTER TABLE pdv_horarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdv_horarios_select_auth" ON pdv_horarios;
CREATE POLICY "pdv_horarios_select_auth"
  ON pdv_horarios FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON pdv_horarios TO authenticated;
GRANT ALL ON pdv_horarios TO service_role;

COMMENT ON TABLE pdv_horarios IS
  'Replica del relevamiento trimestral de horarios de atencion del PDV (base dashboard Mercosur). El JSON se guarda crudo: {dia: {abre, t1, t2}}.';

-- -----------------------------------------------------------------------------
-- 2. El cruce ya resuelto, una fila por vez de CERRADO
-- -----------------------------------------------------------------------------
-- La unidad es la VEZ (cliente x dia), NUNCA la fila de `rechazos`: esa tabla
-- tiene una fila por SKU y 1.542 filas de CERRADO eran 365 veces reales. El
-- arbol ya cuenta veces; esto cuenta igual o los numeros no cierran.
CREATE TABLE IF NOT EXISTS cerrado_horario_analisis (
  id_cliente     BIGINT NOT NULL,
  -- coalesce(fecha_venta, fecha) del rechazo, igual que el resto del arbol.
  dia            DATE   NOT NULL,
  nombre_cliente TEXT,

  -- Hora local (UTC-3) en que pasamos por la puerta. NULL si no se pudo saber.
  hora_visita    TIME,
  -- 'foxtrot'     la hora medida: el chofer cerro la parada (status COMPLETED)
  -- 'interpolada' estimada entre las paradas vecinas de la misma ruta
  -- NULL          no hay forma de saberlo
  -- Nunca se mezclan sin decirlo: el indicador tiene que poder publicarse solo
  -- con las medidas.
  fuente_hora    TEXT,

  ciclo_vh       TEXT,
  -- DENTRO | TEMPRANO | TARDE | SIESTA | NO_ABRE | BORDE | SIN_VH | SIN_HORA
  clasificacion  TEXT   NOT NULL,
  -- Minutos hasta el borde mas cercano de la ventana (0 si cayo adentro). Se
  -- guarda el numero y no solo la etiqueta para poder mover el margen de la
  -- zona gris con un UPDATE, sin volver a leer Foxtrot.
  desvio_min     INT,

  calculado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_cliente, dia)
);

CREATE INDEX IF NOT EXISTS idx_cerrado_horario_dia
  ON cerrado_horario_analisis (dia DESC, clasificacion);

CREATE INDEX IF NOT EXISTS idx_cerrado_horario_clasificacion
  ON cerrado_horario_analisis (clasificacion, dia DESC);

ALTER TABLE cerrado_horario_analisis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cerrado_horario_select_auth" ON cerrado_horario_analisis;
CREATE POLICY "cerrado_horario_select_auth"
  ON cerrado_horario_analisis FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON cerrado_horario_analisis TO authenticated;
GRANT ALL ON cerrado_horario_analisis TO service_role;

COMMENT ON TABLE cerrado_horario_analisis IS
  'Una fila por vez de CERRADO (cliente x dia) clasificada contra la ventana horaria relevada. Materializada por cron; no se calcula en vivo.';

-- -----------------------------------------------------------------------------
-- 3. El cruce, resuelto en la base
-- -----------------------------------------------------------------------------
-- Devuelve una fila por VEZ de CERRADO con la hora y la ventana ya resueltas.
-- Se hace aca y no en TypeScript para no traerse 48.000 paradas por la red en
-- cada corrida: salen las ~420 filas que importan y nada mas.
--
-- La clasificacion NO vive aca: vive en src/lib/cerrado-horarios/clasificar.ts,
-- que es codigo puro y verificable. Esta funcion solo junta los datos.
CREATE OR REPLACE FUNCTION cerrado_horario_casos(p_desde DATE, p_hasta DATE)
RETURNS TABLE (
  id_cliente     BIGINT,
  dia            DATE,
  nombre_cliente TEXT,
  hora_visita    TEXT,
  fuente_hora    TEXT,
  dow            INT,
  ciclo_vh       TEXT,
  horario        JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH cerrado AS (
    -- La unidad es la VEZ, no la fila: `rechazos` tiene una fila por SKU.
    SELECT r.id_cliente,
           COALESCE(r.fecha_venta, r.fecha) AS dia,
           MAX(r.nombre_cliente)            AS nombre_cliente
      FROM rechazos r
     WHERE r.id_rechazo = 1
       AND r.id_cliente IS NOT NULL
       AND COALESCE(r.fecha_venta, r.fecha) BETWEEN p_desde AND p_hasta
     GROUP BY 1, 2
  ),
  paradas AS (
    -- customer_id = 6 digitos de distribuidor + id_cliente de Chess con ceros.
    -- Si hubo dos visitas el mismo dia se toma la PRIMERA: es la que explica el
    -- rechazo, la segunda suele ser el reintento.
    SELECT (ltrim(substring(w.customer_id FROM 7), '0'))::BIGINT AS id_cliente,
           w.fecha,
           MIN(w.completed_timestamp) AS ts
      FROM foxtrot_waypoints_visita w
     WHERE w.completed_timestamp IS NOT NULL
       AND w.customer_id ~ '^[0-9]{14}$'
       AND w.fecha BETWEEN p_desde AND p_hasta
     GROUP BY 1, 2
  )
  SELECT c.id_cliente,
         c.dia,
         c.nombre_cliente,
         to_char(p.ts AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI'),
         CASE WHEN p.ts IS NOT NULL THEN 'foxtrot' END,
         extract(dow FROM c.dia)::INT,
         v.ciclo,
         v.horario
    FROM cerrado c
    LEFT JOIN paradas p
           ON p.id_cliente = c.id_cliente AND p.fecha = c.dia
    -- La ventana que estaba relevada CUANDO paso el rechazo. Si no habia
    -- ninguna todavia, cae al relevamiento mas viejo disponible, que es una
    -- aproximacion y por eso el ciclo viaja en el resultado: quien lee el
    -- numero tiene que poder ver que la ventana es posterior al hecho.
    LEFT JOIN LATERAL (
      SELECT h.ciclo, h.horario
        FROM pdv_horarios h
       WHERE h.id_cliente = c.id_cliente
       ORDER BY (h.ciclo <= to_char(c.dia, 'YYYY') || '-Q' ||
                            extract(quarter FROM c.dia)::TEXT) DESC,
                CASE WHEN h.ciclo <= to_char(c.dia, 'YYYY') || '-Q' ||
                                     extract(quarter FROM c.dia)::TEXT
                     THEN h.ciclo END DESC,
                h.ciclo ASC
       LIMIT 1
    ) v ON TRUE
$$;

GRANT EXECUTE ON FUNCTION cerrado_horario_casos(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION cerrado_horario_casos(DATE, DATE) TO service_role;

COMMENT ON FUNCTION cerrado_horario_casos(DATE, DATE) IS
  'Una fila por vez de CERRADO con la hora de Foxtrot y la ventana relevada vigente a esa fecha. La clasificacion se hace en TS (lib/cerrado-horarios/clasificar.ts).';

-- -----------------------------------------------------------------------------
-- 4. Los numeros para el Arbol del Sueno
-- -----------------------------------------------------------------------------
-- Dos nodos nuevos cuelgan de `cerrado` y lo abren en sus dos mitades, en la
-- MISMA unidad que el padre (% de pedidos), asi cascadean de verdad:
--
--   Cerrado · en horario   fuimos dentro de su ventana -> lo levanta Comercial
--   Cerrado · fuera de horario   fuimos fuera          -> lo levanta quien rutea
--
-- Los dos con mejor_si = menor: los dos hay que bajarlos, con palancas
-- distintas. Lo que no se pudo clasificar NO se reparte entre ambos: queda
-- afuera y se publica como cobertura.
--
-- El denominador es el mismo que usa `sueno_kpi_refresh` para el nodo padre:
-- pedidos = pares distintos (cliente, fecha) de ventas_diarias_cliente.
CREATE OR REPLACE FUNCTION cerrado_horario_resumen(p_anio INT)
RETURNS TABLE (
  dentro     INT,
  fuera      INT,
  base       INT,
  total      INT,
  pedidos    INT,
  pct_dentro NUMERIC,
  pct_fuera  NUMERIC,
  tasa       NUMERIC,
  cobertura  NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH a AS (
    SELECT clasificacion
      FROM cerrado_horario_analisis
     WHERE extract(year FROM dia) = p_anio
  ),
  c AS (
    SELECT count(*) FILTER (WHERE clasificacion = 'DENTRO')::INT AS dentro,
           count(*) FILTER (WHERE clasificacion IN
             ('TEMPRANO','TARDE','SIESTA','NO_ABRE'))::INT        AS fuera,
           count(*)::INT                                          AS total
      FROM a
  ),
  p AS (
    SELECT count(*)::INT AS pedidos
      FROM (SELECT DISTINCT id_cliente, fecha
              FROM ventas_diarias_cliente
             WHERE extract(year FROM fecha) = p_anio) t
  )
  SELECT c.dentro,
         c.fuera,
         (c.dentro + c.fuera)::INT AS base,
         c.total,
         p.pedidos,
         round(100.0 * c.dentro / nullif(p.pedidos, 0), 3),
         round(100.0 * c.fuera  / nullif(p.pedidos, 0), 3),
         round(100.0 * c.dentro / nullif(c.dentro + c.fuera, 0), 1),
         round(100.0 * (c.dentro + c.fuera) / nullif(c.total, 0), 1)
    FROM c, p
$$;

GRANT EXECUTE ON FUNCTION cerrado_horario_resumen(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cerrado_horario_resumen(INT) TO service_role;

-- La comparativa mes a mes que se ve al abrir el nodo.
CREATE OR REPLACE FUNCTION cerrado_horario_mensual(p_anio INT)
RETURNS TABLE (
  mes       INT,
  dentro    INT,
  temprano  INT,
  tarde     INT,
  siesta    INT,
  no_abre   INT,
  borde     INT,
  sin_vh    INT,
  sin_hora  INT,
  total     INT,
  tasa      NUMERIC,
  cobertura NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT extract(month FROM dia)::INT AS mes,
         count(*) FILTER (WHERE clasificacion = 'DENTRO')::INT,
         count(*) FILTER (WHERE clasificacion = 'TEMPRANO')::INT,
         count(*) FILTER (WHERE clasificacion = 'TARDE')::INT,
         count(*) FILTER (WHERE clasificacion = 'SIESTA')::INT,
         count(*) FILTER (WHERE clasificacion = 'NO_ABRE')::INT,
         count(*) FILTER (WHERE clasificacion = 'BORDE')::INT,
         count(*) FILTER (WHERE clasificacion = 'SIN_VH')::INT,
         count(*) FILTER (WHERE clasificacion = 'SIN_HORA')::INT,
         count(*)::INT,
         round(100.0 * count(*) FILTER (WHERE clasificacion = 'DENTRO')
               / nullif(count(*) FILTER (WHERE clasificacion IN
                   ('DENTRO','TEMPRANO','TARDE','SIESTA','NO_ABRE')), 0), 1),
         round(100.0 * count(*) FILTER (WHERE clasificacion IN
                   ('DENTRO','TEMPRANO','TARDE','SIESTA','NO_ABRE'))
               / nullif(count(*), 0), 1)
    FROM cerrado_horario_analisis
   WHERE extract(year FROM dia) = p_anio
   GROUP BY 1
   ORDER BY 1
$$;

GRANT EXECUTE ON FUNCTION cerrado_horario_mensual(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cerrado_horario_mensual(INT) TO service_role;

-- Metas de arranque. Son PROVISORIAS: salen de extrapolar 2026 (173 dentro y
-- 105 fuera sobre ~48.600 pedidos) y hay que validarlas con la operacion.
INSERT INTO sueno_kpi_valores (kpi_key, anio, meta, gatillo, mejor_si, nota)
VALUES
  ('cerrado_en_horario',    2026, 0.30, 0.45, 'menor',
   'Veces que fuimos dentro de la ventana declarada y estaba cerrado. Palanca: Comercial.'),
  ('cerrado_fuera_horario', 2026, 0.10, 0.20, 'menor',
   'Veces que fuimos fuera de su horario. Palanca: ruteo. El 73% es la siesta.')
ON CONFLICT (kpi_key, anio) DO NOTHING;
