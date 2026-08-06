-- =============================================
-- GOPs y Toolkits (DPO Gestión 4.5) · catálogo, carga mensual, triage y planes
-- =============================================
-- El Consolidado de GOPs y Toolkits es un Excel que se completa una vez por mes:
-- 11 GOPs/Toolkits (hoja por tema), ~154 preguntas con Si / No / N/A, y el puntaje
-- del tema = promedio simple de sus preguntas contra un target de 0,85.
--
-- La app no reemplaza ese Excel (se sigue subiendo al Campus): lo IMPORTA y agrega
-- lo que el Excel no tiene — qué se hace con cada "No".
--
-- El punto DPO MGT 4.5 (R4.5.3) exige acciones para las respuestas y notas para las
-- N/A: por eso todo "No" tiene que terminar en una DECISIÓN registrada, que puede ser
-- un plan de acción, un diferimiento a largo plazo con motivo, o un no-aplica con nota.
-- La decisión se hereda mes a mes (vive por pregunta, no por período): al mes siguiente
-- solo hay que decidir sobre lo nuevo y sobre lo que venció su fecha de revisión.
--
-- Idempotente.
-- =============================================

BEGIN;

-- =============================================
-- a) Catálogo de temas (una hoja del Excel = un GOP/Toolkit)
-- =============================================
CREATE TABLE IF NOT EXISTS gops_temas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nombre EXACTO de la hoja del Excel: es la clave con la que el importador
  -- reconoce el tema cuando se vuelve a subir el archivo cada mes.
  hoja TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,                      -- KPI: 'WQI', 'Obsolescencia', ...
  area TEXT,                                 -- 'Almacén' | 'Seguridad' | 'Entrega' | 'Flota'
  tipo TEXT NOT NULL DEFAULT 'GOP',          -- 'GOP' | 'Toolkit'
  frecuencia TEXT NOT NULL DEFAULT 'mensual',
  target NUMERIC(5,4) NOT NULL DEFAULT 0.85,
  dueno TEXT,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gops_temas_tipo_chk CHECK (tipo IN ('GOP', 'Toolkit')),
  CONSTRAINT gops_temas_frecuencia_chk CHECK (frecuencia IN ('mensual', 'bimestral')),
  CONSTRAINT gops_temas_target_chk CHECK (target > 0 AND target <= 1)
);

CREATE INDEX IF NOT EXISTS idx_gops_temas_orden ON gops_temas(orden);

-- =============================================
-- b) Catálogo de preguntas
-- =============================================
CREATE TABLE IF NOT EXISTS gops_preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id UUID NOT NULL REFERENCES gops_temas(id) ON DELETE CASCADE,
  -- Código estable de la pregunta. Sale del ID del Excel ('7_7_64_762') cuando la
  -- hoja lo trae; si no, del número al inicio del texto ('132.Existe una SOP...').
  -- Es lo que permite reimportar el mes siguiente sin duplicar preguntas.
  codigo TEXT NOT NULL,
  seccion TEXT,                              -- 'Almacenamiento', 'Reempaque', ...
  texto TEXT NOT NULL,
  comentario TEXT,                           -- comentario base que trae el Excel
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gops_preguntas_codigo_uq UNIQUE (tema_id, codigo),
  CONSTRAINT gops_preguntas_texto_chk CHECK (btrim(texto) <> '')
);

CREATE INDEX IF NOT EXISTS idx_gops_preguntas_tema ON gops_preguntas(tema_id, orden);

-- =============================================
-- c) Respuestas mensuales (lo que dice el Excel)
-- =============================================
CREATE TABLE IF NOT EXISTS gops_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID NOT NULL REFERENCES gops_preguntas(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  mes INT NOT NULL,
  valor TEXT NOT NULL,                       -- 'si' | 'no' | 'na'
  comentario TEXT,
  importado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,

  CONSTRAINT gops_respuestas_uq UNIQUE (pregunta_id, anio, mes),
  CONSTRAINT gops_respuestas_valor_chk CHECK (valor IN ('si', 'no', 'na')),
  CONSTRAINT gops_respuestas_mes_chk CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT gops_respuestas_anio_chk CHECK (anio BETWEEN 2020 AND 2100)
);

CREATE INDEX IF NOT EXISTS idx_gops_respuestas_periodo ON gops_respuestas(anio, mes);
CREATE INDEX IF NOT EXISTS idx_gops_respuestas_valor ON gops_respuestas(valor);

-- =============================================
-- d) Planes de acción sobre GOPs
-- =============================================
-- Modelado sobre 155_tlp_planes_accion. Un plan cuelga siempre de un tema y puede
-- cubrir varias preguntas: las decisiones apuntan al plan, no al revés.
CREATE TABLE IF NOT EXISTS gops_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id UUID NOT NULL REFERENCES gops_temas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- 'corto' = se busca cerrarlo en el mes/trimestre; 'largo' = estructural, depende
  -- de inversión o de terceros. El horizonte es lo que separa un plan activo de un
  -- pendiente que no debería ensuciar la lista de trabajo del mes.
  horizonte TEXT NOT NULL DEFAULT 'corto',
  prioridad TEXT NOT NULL DEFAULT 'media',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  responsable_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_objetivo DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gops_planes_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT gops_planes_horizonte_chk CHECK (horizonte IN ('corto', 'largo')),
  CONSTRAINT gops_planes_estado_chk CHECK (
    estado IN ('pendiente', 'en_progreso', 'completado')
  ),
  CONSTRAINT gops_planes_prioridad_chk CHECK (prioridad IN ('alta', 'media', 'baja'))
);

CREATE INDEX IF NOT EXISTS idx_gops_planes_tema ON gops_planes(tema_id);
CREATE INDEX IF NOT EXISTS idx_gops_planes_estado ON gops_planes(estado);

CREATE TABLE IF NOT EXISTS gops_planes_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES gops_planes(id) ON DELETE CASCADE,
  comentario TEXT,
  archivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  archivo_path TEXT,                         -- primer archivo (lectores viejos)
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  estado_resultante TEXT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gops_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
  ),
  CONSTRAINT gops_avances_estado_chk CHECK (
    estado_resultante IS NULL
    OR estado_resultante IN ('pendiente', 'en_progreso', 'completado')
  )
);

CREATE INDEX IF NOT EXISTS idx_gops_avances_plan ON gops_planes_avances(plan_id);

-- =============================================
-- e) Decisiones (el triage de cada "No")
-- =============================================
-- Una fila por pregunta: es la decisión VIGENTE, y por eso se hereda de un mes al
-- siguiente sin volver a pedirla. Si no hay fila y la última respuesta es 'no',
-- la pregunta aparece como "sin decidir" — que es exactamente lo que mira el auditor.
CREATE TABLE IF NOT EXISTS gops_decisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID NOT NULL UNIQUE REFERENCES gops_preguntas(id) ON DELETE CASCADE,
  destino TEXT NOT NULL,                     -- 'plan' | 'largo_plazo' | 'no_aplica'
  motivo TEXT,
  -- Fecha en la que la decisión vuelve a la superficie. Es la regla anti-cajón:
  -- lo diferido reaparece solo, no queda enterrado hasta la auditoría.
  fecha_revision DATE,
  plan_id UUID REFERENCES gops_planes(id) ON DELETE SET NULL,
  decidido_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decidido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gops_decisiones_destino_chk CHECK (
    destino IN ('plan', 'largo_plazo', 'no_aplica')
  ),
  -- Diferir o descartar sin explicar es lo que R4.5.3 no perdona.
  CONSTRAINT gops_decisiones_motivo_chk CHECK (
    destino = 'plan' OR coalesce(btrim(motivo), '') <> ''
  ),
  CONSTRAINT gops_decisiones_plan_chk CHECK (
    destino <> 'plan' OR plan_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_gops_decisiones_destino ON gops_decisiones(destino);
CREATE INDEX IF NOT EXISTS idx_gops_decisiones_revision ON gops_decisiones(fecha_revision);

-- =============================================
-- f) Log de importaciones
-- =============================================
CREATE TABLE IF NOT EXISTS gops_importaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre TEXT NOT NULL,
  anio INT NOT NULL,
  -- Meses efectivamente importados en esa corrida (el archivo trae el año entero).
  meses INT[] NOT NULL DEFAULT '{}',
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  importado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gops_importaciones_created ON gops_importaciones(created_at DESC);

-- =============================================
-- g) RLS
-- =============================================
-- Todo el mundo autenticado LEE (el tablero es de consulta general); escriben los
-- roles de gestión, y sobre un plan también su responsable.
ALTER TABLE gops_temas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gops_preguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gops_respuestas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gops_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gops_planes_avances ENABLE ROW LEVEL SECURITY;
ALTER TABLE gops_decisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE gops_importaciones ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'gops_temas', 'gops_preguntas', 'gops_respuestas',
    'gops_planes', 'gops_planes_avances', 'gops_decisiones', 'gops_importaciones'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
      t || '_select_auth', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write_gestion', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_write_gestion', t,
      'EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'', ''supervisor'', ''admin_rrhh''))',
      'EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''admin'', ''supervisor'', ''admin_rrhh''))'
    );
    EXECUTE format('GRANT ALL ON %I TO anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- El responsable de un plan puede moverlo y cargarle avances aunque no sea de gestión.
DROP POLICY IF EXISTS "gops_planes_update_responsable" ON gops_planes;
CREATE POLICY "gops_planes_update_responsable"
  ON gops_planes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR responsable_id = auth.uid());

DROP POLICY IF EXISTS "gops_avances_insert_responsable" ON gops_planes_avances;
CREATE POLICY "gops_avances_insert_responsable"
  ON gops_planes_avances FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (
      SELECT id FROM gops_planes
      WHERE created_by = auth.uid() OR responsable_id = auth.uid()
    )
  );

-- =============================================
-- h) Bucket de evidencia de los planes
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('gops-planes', 'gops-planes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "gops_planes_storage_read" ON storage.objects;
CREATE POLICY "gops_planes_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gops-planes');

DROP POLICY IF EXISTS "gops_planes_storage_insert" ON storage.objects;
CREATE POLICY "gops_planes_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gops-planes');

DROP POLICY IF EXISTS "gops_planes_storage_delete" ON storage.objects;
CREATE POLICY "gops_planes_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gops-planes');

COMMIT;

NOTIFY pgrst, 'reload schema';
