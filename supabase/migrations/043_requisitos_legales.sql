-- =============================================
-- 043 · Requisitos Legales (Pilar Planeamiento, punto 2.1)
-- =============================================
-- Permisos y licencias para el derecho a operar.
-- Modelo: categorías (tabs) + items (filas dentro de cada categoría).
-- Cada categoría declara qué representa el "identificador" de sus items
-- (ninguno, vehiculo, persona, ubicacion) para que la UI etiquete bien.
-- =============================================

BEGIN;

-- =============================================
-- 1) Categorías
-- =============================================
CREATE TABLE IF NOT EXISTS requisitos_legales_categorias (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                   text NOT NULL UNIQUE,
  slug                     text NOT NULL UNIQUE,
  tipo_identificador       text NOT NULL DEFAULT 'ninguno'
                             CHECK (tipo_identificador IN
                               ('ninguno', 'vehiculo', 'persona', 'ubicacion')),
  identificador_label      text,
  responsable_principal_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  orden                    int NOT NULL DEFAULT 0,
  activa                   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN requisitos_legales_categorias.tipo_identificador IS
  'Define qué representa el campo identificador en sus items. Ej. para Seguro = vehiculo (patente), Carnet = persona, Extintores depósito = ubicacion.';

-- Precarga de las 7 categorías iniciales
INSERT INTO requisitos_legales_categorias
  (nombre, slug, tipo_identificador, identificador_label, orden) VALUES
  ('General',                       'general',          'ninguno',   NULL,         10),
  ('Seguro vehicular',              'seguro',           'vehiculo',  'Vehículo',   20),
  ('VTV',                           'vtv',              'vehiculo',  'Vehículo',   30),
  ('SENASA',                        'senasa',           'vehiculo',  'Vehículo',   40),
  ('Extintores camiones',           'extintores',       'vehiculo',  'Vehículo',   50),
  ('Extintores depósito',           'extintores-depo',  'ubicacion', 'Ubicación',  60),
  ('Carnet Manipulación alimentos', 'carnet-manip',     'persona',   'Persona',    70)
ON CONFLICT (slug) DO NOTHING;


-- =============================================
-- 2) Items (cada permiso/licencia/documento)
-- =============================================
CREATE TABLE IF NOT EXISTS requisitos_legales (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id       uuid NOT NULL REFERENCES requisitos_legales_categorias(id) ON DELETE RESTRICT,
  nombre             text NOT NULL,
  fecha_emision      date,
  fecha_vencimiento  date NOT NULL,
  responsable_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  archivo_url        text,
  archivo_nombre     text,
  observaciones      text,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN requisitos_legales.nombre IS
  'Texto principal del item. En General = nombre del requisito (ej. "Habilitación Ramallo"). En categorías por vehículo = patente. En Carnet = nombre de la persona. En Extintores depósito = ubicación.';

CREATE INDEX IF NOT EXISTS idx_requisitos_legales_categoria
  ON requisitos_legales(categoria_id);

CREATE INDEX IF NOT EXISTS idx_requisitos_legales_vencimiento
  ON requisitos_legales(fecha_vencimiento);

CREATE INDEX IF NOT EXISTS idx_requisitos_legales_responsable
  ON requisitos_legales(responsable_id);


-- =============================================
-- 3) Configuración de destinatarios fijos de alertas
-- =============================================
-- Los destinatarios son fijos por pedido del negocio. Se guardan por email
-- (no por user_id) porque algunos podrían no tener cuenta todavía. Cuando
-- la cuenta se cree, el cron los matcheará automáticamente.
CREATE TABLE IF NOT EXISTS requisitos_legales_alertas_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO requisitos_legales_alertas_config (email, nombre) VALUES
  ('fazzaretti@mercosurdrp.com.ar', 'Fausto Azzaretti'),
  ('sroselli@mercosurdrp.com.ar',   'Sebastián Roselli'),
  ('mpascuali@mercosurdrp.com.ar',  'María José Pascuali'),
  ('ealtube@mercosurdrp.com.ar',    'Esteban Altube'),
  ('etevez@mercosurdrp.com.ar',     'Ezequiel Tévez')
ON CONFLICT (email) DO NOTHING;


-- =============================================
-- 4) Log de alertas enviadas (idempotencia diaria)
-- =============================================
CREATE TABLE IF NOT EXISTS requisitos_legales_alertas_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisito_id    uuid NOT NULL REFERENCES requisitos_legales(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fecha_enviada   date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  dias_restantes  int  NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requisito_id, user_id, fecha_enviada)
);


-- =============================================
-- 5) RLS
-- =============================================
ALTER TABLE requisitos_legales_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitos_legales ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitos_legales_alertas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitos_legales_alertas_log ENABLE ROW LEVEL SECURITY;

-- Categorías: lectura para todos, escritura admin
DROP POLICY IF EXISTS "req_legales_cats_select_auth" ON requisitos_legales_categorias;
CREATE POLICY "req_legales_cats_select_auth"
  ON requisitos_legales_categorias FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "req_legales_cats_write_admin" ON requisitos_legales_categorias;
CREATE POLICY "req_legales_cats_write_admin"
  ON requisitos_legales_categorias FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Items: lectura para todos, escritura admin/supervisor/admin_rrhh
DROP POLICY IF EXISTS "requisitos_legales_select_auth" ON requisitos_legales;
CREATE POLICY "requisitos_legales_select_auth"
  ON requisitos_legales FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "requisitos_legales_write_editors" ON requisitos_legales;
CREATE POLICY "requisitos_legales_write_editors"
  ON requisitos_legales FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );

-- Config alertas: lectura admin/supervisor, escritura admin
DROP POLICY IF EXISTS "requisitos_alertas_config_read" ON requisitos_legales_alertas_config;
CREATE POLICY "requisitos_alertas_config_read"
  ON requisitos_legales_alertas_config FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "requisitos_alertas_config_write_admin" ON requisitos_legales_alertas_config;
CREATE POLICY "requisitos_alertas_config_write_admin"
  ON requisitos_legales_alertas_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Log: solo lectura admin (insert lo hace el cron con service role)
DROP POLICY IF EXISTS "requisitos_alertas_log_read_admin" ON requisitos_legales_alertas_log;
CREATE POLICY "requisitos_alertas_log_read_admin"
  ON requisitos_legales_alertas_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));


-- =============================================
-- 6) Triggers updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_req_legales_cats_updated_at ON requisitos_legales_categorias;
CREATE TRIGGER trg_req_legales_cats_updated_at
  BEFORE UPDATE ON requisitos_legales_categorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_requisitos_legales_updated_at ON requisitos_legales;
CREATE TRIGGER trg_requisitos_legales_updated_at
  BEFORE UPDATE ON requisitos_legales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================
-- 7) Storage bucket privado
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('requisitos-legales', 'requisitos-legales', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "requisitos_legales_storage_read" ON storage.objects;
CREATE POLICY "requisitos_legales_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'requisitos-legales');

DROP POLICY IF EXISTS "requisitos_legales_storage_insert" ON storage.objects;
CREATE POLICY "requisitos_legales_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'requisitos-legales'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

DROP POLICY IF EXISTS "requisitos_legales_storage_delete" ON storage.objects;
CREATE POLICY "requisitos_legales_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'requisitos-legales'
    AND EXISTS (SELECT 1 FROM profiles
                WHERE id = auth.uid()
                AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

COMMIT;
