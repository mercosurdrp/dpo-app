-- =============================================================================
-- Bots por pilar (fase 1: Entrega)
-- =============================================================================
-- Cada pilar DPO tiene un bot que todas las mañanas mira los indicadores de su
-- reunión (los mismos que la grilla, vía getIndicadoresMes), le escribe al
-- encargado por WhatsApp y deja PROPUESTOS planes de acción para los rojos.
-- Un humano los aprueba desde /bots (ahí se crean en planes_accion) o los
-- descarta. Los números los calcula la app; el modelo solo redacta.
--
--   bots_pilar              configuración de cada bot (1 fila por pilar)
--   bots_corridas           cada ronda (y en fase 2, cada reunión de bots):
--                           qué vio, qué dijo, si se mandó
--   bots_planes_propuestos  planes que propuso un bot, hasta que se resuelven
--
-- Escritura: sólo service role (cron + server actions). Lectura: admin y
-- supervisor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS bots_pilar (
  key TEXT PRIMARY KEY,                        -- 'entrega', 'flota', ...
  nombre TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🤖',
  reunion_tipo TEXT NOT NULL,                  -- tipo de reunión cuyos indicadores mira
  indicadores TEXT[] NOT NULL DEFAULT '{}',    -- ids auto_* o nombres; vacío = todos
  encargado_profile_id UUID REFERENCES profiles(id),
  telefono TEXT,                               -- E.164 sin '+', ej 5493407123456
  prompt_extra TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bots_corridas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_key TEXT NOT NULL REFERENCES bots_pilar(key),
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'ronda' CHECK (tipo IN ('ronda', 'reunion')),
  contexto JSONB,                              -- indicadores que vio
  salida JSONB,                                -- respuesta estructurada del modelo
  mensaje TEXT,
  modo TEXT NOT NULL DEFAULT 'ia' CHECK (modo IN ('ia', 'plantilla')),
  modelo TEXT,
  dry BOOLEAN NOT NULL DEFAULT false,
  enviado BOOLEAN NOT NULL DEFAULT false,
  destino TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bots_corridas_bot_fecha
  ON bots_corridas (bot_key, created_at DESC);

CREATE TABLE IF NOT EXISTS bots_planes_propuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id UUID NOT NULL REFERENCES bots_corridas(id) ON DELETE CASCADE,
  bot_key TEXT NOT NULL REFERENCES bots_pilar(key),
  indicador TEXT NOT NULL,
  titulo TEXT NOT NULL,
  causa_probable TEXT,
  accion TEXT NOT NULL,
  responsable_sugerido TEXT,
  fecha_objetivo DATE,
  estado TEXT NOT NULL DEFAULT 'propuesto'
    CHECK (estado IN ('propuesto', 'aprobado', 'descartado')),
  plan_accion_id UUID REFERENCES planes_accion(id) ON DELETE SET NULL,
  resuelto_por UUID REFERENCES profiles(id),
  resuelto_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bots_planes_estado
  ON bots_planes_propuestos (estado, created_at DESC);

ALTER TABLE bots_pilar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots_corridas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots_planes_propuestos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin y supervisor leen bots_pilar" ON bots_pilar;
CREATE POLICY "Admin y supervisor leen bots_pilar"
  ON bots_pilar FOR SELECT TO authenticated
  USING (auth_role() IN ('admin', 'supervisor'));

DROP POLICY IF EXISTS "Admin y supervisor leen bots_corridas" ON bots_corridas;
CREATE POLICY "Admin y supervisor leen bots_corridas"
  ON bots_corridas FOR SELECT TO authenticated
  USING (auth_role() IN ('admin', 'supervisor'));

DROP POLICY IF EXISTS "Admin y supervisor leen bots_planes_propuestos" ON bots_planes_propuestos;
CREATE POLICY "Admin y supervisor leen bots_planes_propuestos"
  ON bots_planes_propuestos FOR SELECT TO authenticated
  USING (auth_role() IN ('admin', 'supervisor'));
-- Sin policies de escritura: sólo service role.

-- ── Seed: bot de Entrega ─────────────────────────────────────────────────────
INSERT INTO bots_pilar (key, nombre, emoji, reunion_tipo, indicadores, encargado_profile_id, telefono, prompt_extra)
SELECT
  'entrega',
  'Entrega',
  '🚚',
  'matinal-distribucion',
  '{}',
  (SELECT id FROM profiles WHERE email = 'fazzaretti@mercosurdrp.com.ar' LIMIT 1),
  '5493407494491',                              -- Fausto, mientras se calibra
  'Indicadores de la Reunión Matinal de Distribución. Rechazos % = bultos rechazados sobre vendidos; TML = minutos desde la hora de entrada hasta la salida del camión por portería (meta 25); OB = ocupación de bodega sobre 600 CEq; TLP = tiempo de liberación; los indicadores de Foxtrot salen del GPS de la ruta. Bultos y HL vendidos dependen de Ventas: informalos, pero NO propongas planes sobre ellos. Los roles posibles son Supervisor de Distribución, Encargado de Portería, Supervisor de Flota y Analista de Ruteo.'
ON CONFLICT (key) DO NOTHING;
