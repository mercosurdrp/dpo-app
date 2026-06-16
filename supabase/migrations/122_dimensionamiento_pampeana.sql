-- 122: Dimensionamiento de Distribución/Flota (DPO Planeamiento 3.1) — SOLO Pampeana
-- R3.1 Monitoreo de dimensionamiento: herramienta de dimensionamiento de flota basada
-- en el volumen, monitoreo de KPIs de distribución (dropsize, entregas/viaje, ocupación,
-- disponibilidad) y planes de acción. Etapa 1 = Distribución/Flota.
-- Fuentes Pampeana: ruteo_cierres (volumen/clientes/no-ruteado), catalogo_vehiculos +
-- KM/mantenimiento (disponibilidad), capacidad de flota cargada acá (no existía en Pampeana).

begin;

-- ───────────────────────── Capacidad de la flota de distribución ────────────
-- Una fila por unidad de reparto. La capacidad no estaba cargada en Pampeana
-- (orden_salida_flota es de Misiones), así que es la fuente propia de capacidad.
CREATE TABLE IF NOT EXISTS dim_flota_capacidad (
  dominio          text PRIMARY KEY,
  capacidad_bultos numeric NOT NULL DEFAULT 0,
  capacidad_kg     numeric,
  activo           boolean NOT NULL DEFAULT true,
  updated_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── Parámetros generales (singleton) ─────────────────
CREATE TABLE IF NOT EXISTS dim_config (
  id                  integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  peso_kg_bulto       numeric NOT NULL DEFAULT 0,     -- para ocupación en kg (opcional)
  dias_operativos_mes numeric NOT NULL DEFAULT 26,    -- días de reparto por mes
  viajes_por_dia      numeric NOT NULL DEFAULT 1,     -- vueltas promedio por unidad/día
  updated_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dim_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ───────────────────────── Objetivos de KPIs de distribución ────────────────
CREATE TABLE IF NOT EXISTS dim_kpi_objetivos (
  kpi        text PRIMARY KEY,            -- dropsize | entregas_por_viaje | pct_no_ruteado | ocupacion_pct
  nombre     text NOT NULL,
  unidad     text NOT NULL DEFAULT '',
  objetivo   numeric NOT NULL DEFAULT 0,
  mejor_si   text NOT NULL DEFAULT 'mayor' CHECK (mejor_si IN ('mayor','menor')),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dim_kpi_objetivos (kpi, nombre, unidad, objetivo, mejor_si) VALUES
  ('dropsize',          'Dropsize',            'bultos/cliente', 0, 'mayor'),
  ('entregas_por_viaje','Entregas por viaje',  'clientes/viaje', 0, 'mayor'),
  ('pct_no_ruteado',    '% no ruteado',        '%',              0, 'menor'),
  ('ocupacion_pct',     'Ocupación de flota',  '%',             90, 'mayor')
ON CONFLICT (kpi) DO NOTHING;

-- ───────────────────────── Planes de acción 5W2H ────────────────────────────
CREATE TABLE IF NOT EXISTS dim_planes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  que         text NOT NULL,
  por_que     text,
  quien       text,
  donde       text,
  cuando      date,
  como        text,
  cuanto      text,
  estado      text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','completado')),
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dim_planes_estado ON dim_planes (estado);

-- ───────────────────────── TOR / reunión mensual ────────────────────────────
INSERT INTO reuniones_tor (tipo, objetivos, dueno, ubicacion, dia_horario, frecuencia)
VALUES (
  'dimensionamiento',
  'Revisar el dimensionamiento de la flota de distribución vs el volumen pronosticado, monitorear KPIs de productividad (dropsize, entregas por viaje, ocupación, disponibilidad) y asegurar recursos suficientes al menor costo.',
  'Líder de Planeamiento / Entrega',
  'Sala de reuniones',
  'Mensual',
  'Mensual'
)
ON CONFLICT (tipo) DO NOTHING;

-- ───────────────────────── RLS ──────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dim_flota_capacidad','dim_config','dim_kpi_objetivos','dim_planes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_auth" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_select_auth" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL TO authenticated USING (
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'',''supervisor'',''admin_rrhh''))
       ) WITH CHECK (
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'',''supervisor'',''admin_rrhh''))
       )', t, t);
  END LOOP;
END $$;

commit;
