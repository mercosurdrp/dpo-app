-- 120: Rutina de Pronóstico (DPO Planeamiento 3.2)
-- R3.2.1 TOR + reunión mensual con asistencia · R3.2.2 política de inventario y
-- % SKUs fuera de rango · R3.2.3 SKUs nuevos/retirados · R3.2.4 OOS teórico + planes.
-- Incluye reuniones_tor / reuniones_tor_items, que el código de periodos-criticos
-- (api/planeamiento/periodos-criticos/tor) ya esperaba y faltaban en la DB.

-- ─── TOR genérico de reuniones ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reuniones_tor (
  tipo        text PRIMARY KEY,
  objetivos   text NOT NULL DEFAULT '',
  dueno       text NOT NULL DEFAULT '',
  ubicacion   text NOT NULL DEFAULT '',
  dia_horario text NOT NULL DEFAULT '',
  frecuencia  text NOT NULL DEFAULT '',
  updated_by  uuid REFERENCES profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reuniones_tor_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL,
  seccion     text NOT NULL CHECK (seccion IN ('participante','regla','entrada','salida','kpi','temario')),
  orden       integer NOT NULL DEFAULT 0,
  texto       text NOT NULL,
  responsable text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reuniones_tor_items_tipo_idx ON reuniones_tor_items (tipo, seccion, orden);

-- ─── Política de inventario por segmento (días de cobertura) ────────────────
CREATE TABLE IF NOT EXISTS pronostico_politica (
  segmento   text PRIMARY KEY,            -- cervezas | aguas | ung | otro
  nombre     text NOT NULL,
  min_dias   numeric NOT NULL,
  max_dias   numeric NOT NULL,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pronostico_politica (segmento, nombre, min_dias, max_dias) VALUES
  ('cervezas', 'Cervezas', 8, 30),
  ('aguas',    'Aguas',    8, 30),
  ('ung',      'UNG',      8, 30),
  ('otro',     'Otros / Marketplace', 8, 45)
ON CONFLICT (segmento) DO NOTHING;

-- ─── Snapshot mensual de cobertura (evidencia para la reunión) ──────────────
CREATE TABLE IF NOT EXISTS pronostico_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio        integer NOT NULL,
  mes         integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  total_skus  integer NOT NULL DEFAULT 0,
  pct_debajo  numeric NOT NULL DEFAULT 0,
  pct_encima  numeric NOT NULL DEFAULT 0,
  pct_ok      numeric NOT NULL DEFAULT 0,
  detalle     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);

-- ─── SKUs nuevos y retirados (R3.2.3) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pronostico_sku_cambios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                text NOT NULL CHECK (tipo IN ('alta','baja')),
  articulo            text NOT NULL,
  descripcion         text NOT NULL DEFAULT '',
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  configurado_sistema boolean NOT NULL DEFAULT false,
  comunicado_equipo   boolean NOT NULL DEFAULT false,
  evidencia_url       text,
  notas               text,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── Reunión mensual de pronóstico (R3.2.1) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pronostico_reuniones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha      date NOT NULL,
  metrica    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- precisión retiros, % fuera de rango al momento
  notas      text,
  acta_url   text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pronostico_reuniones_asistentes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL REFERENCES pronostico_reuniones(id) ON DELETE CASCADE,
  nombre     text NOT NULL,
  area       text NOT NULL DEFAULT 'operaciones' CHECK (area IN ('ventas','operaciones','otro')),
  presente   boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS pronostico_reu_asist_idx ON pronostico_reuniones_asistentes (reunion_id);

-- ─── OOS teórico: planes de acción (R3.2.4) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pronostico_oos_planes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo      text NOT NULL,
  descripcion   text NOT NULL DEFAULT '',
  brecha        text,                      -- ej: "cobertura 1,2 días (piso 3)"
  accion        text NOT NULL,
  responsable   text,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','completado')),
  fecha_objetivo date,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reuniones_tor','reuniones_tor_items','pronostico_politica','pronostico_snapshots',
    'pronostico_sku_cambios','pronostico_reuniones','pronostico_reuniones_asistentes',
    'pronostico_oos_planes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_auth" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_select_auth" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL TO authenticated USING (
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'',''supervisor'',''admin_rrhh''))
       ) WITH CHECK (
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'',''supervisor'',''admin_rrhh''))
       )', t, t);
  END LOOP;
END $$;

-- ─── Seed TOR de la Reunión de Pronóstico ───────────────────────────────────
INSERT INTO reuniones_tor (tipo, objetivos, dueno, ubicacion, dia_horario, frecuencia)
VALUES (
  'pronostico',
  'Revisar el pronóstico de volumen y el plan de retiros junto a ventas y operaciones para minimizar SKUs fuera de rango (quiebres y sobre-stock), reducir obsolescencia y asegurar la correcta alta/baja de SKUs en el sistema.',
  'Jefe de Logística (operaciones) + Supervisor de Ventas — propiedad compartida',
  'Sala de reuniones depósito / virtual',
  'Primera semana hábil del mes',
  'Mensual (mínimo requerido por DPO R3.2.1)'
)
ON CONFLICT (tipo) DO NOTHING;

INSERT INTO reuniones_tor_items (tipo, seccion, orden, texto, responsable)
SELECT 'pronostico', x.seccion, x.orden, x.texto, x.responsable
FROM (VALUES
  ('participante', 0, 'Jefe de Logística (dueño operaciones)', NULL),
  ('participante', 1, 'Supervisor de Ventas (dueño ventas)', NULL),
  ('participante', 2, 'Encargado de Depósito', NULL),
  ('participante', 3, 'Analista de Planeamiento / BI', NULL),
  ('regla', 0, 'Frecuencia mensual obligatoria; se registra asistencia de cada participante', NULL),
  ('regla', 1, 'Las decisiones y planes quedan documentados en el módulo de Pronóstico (dpo-app)', NULL),
  ('regla', 2, 'La política de inventario se revisa al menos una vez por trimestre', NULL),
  ('entrada', 0, '% de SKUs fuera de rango (debajo / encima) según política de inventario', NULL),
  ('entrada', 1, 'Métrica de pronóstico: cumplimiento de retiros real vs objetivo por categoría', NULL),
  ('entrada', 2, 'SKUs nuevos y retirados del período (configuración en sistema + comunicación)', NULL),
  ('entrada', 3, 'Quiebres teóricos (OOS) y SKUs próximos a quebrar', NULL),
  ('entrada', 4, 'Obsolescencia: vencidos y fecha corta del mes (app Depósito)', NULL),
  ('salida', 0, 'Planes de acción sobre SKUs en riesgo (OOS / sobre-stock)', NULL),
  ('salida', 1, 'Ajustes al plan de retiros del mes siguiente', NULL),
  ('salida', 2, 'Comunicaciones de altas/bajas de SKU al equipo', NULL),
  ('kpi', 0, 'Cumplimiento de retiros vs objetivo (Cervezas / Aguas / UNG)', NULL),
  ('kpi', 1, '% SKUs debajo del rango y % encima del rango', NULL),
  ('kpi', 2, 'Cantidad de quiebres teóricos del mes', NULL),
  ('kpi', 3, '$ de vencidos (obsolescencia) del mes', NULL),
  ('temario', 0, 'Revisión de la métrica de pronóstico del mes', 'Analista'),
  ('temario', 1, 'SKUs fuera de rango: análisis de debajo y encima', 'Jefe de Logística'),
  ('temario', 2, 'Quiebres teóricos y planes de acción', 'Jefe de Logística'),
  ('temario', 3, 'SKUs nuevos y retirados: configuración y comunicación', 'Supervisor de Ventas'),
  ('temario', 4, 'Obsolescencia y vencimientos próximos', 'Encargado de Depósito'),
  ('temario', 5, 'Compromisos y responsables', 'Todos')
) AS x(seccion, orden, texto, responsable)
WHERE NOT EXISTS (SELECT 1 FROM reuniones_tor_items WHERE tipo = 'pronostico');
