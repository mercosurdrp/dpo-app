-- Módulo Benchmarking (punto DPO Entrega 5.2 BENCHMARK).
--
-- H1 2026 dio 1: "Realizaron bench con Palco un día antes de la auditoría.
-- Vieron TLP, rechazos, RMD. Para H2 mostrar proceso documentado y
-- resultados. Oportunidad de realizar bench interno."
--
-- Lo que pide el punto:
--   R5.2.1  bench INTERNO: comparar equipos de entrega (costo, servicio, SKPI)
--   R5.2.2  mejores/peores + plan de acción (OWD sobre los SOP de los SKPI)
--   R5.2.3  bench EXTERNO con otro distribuidor ABI u operación similar
--   R5.2.4  los SKPI muestran tendencia positiva desde el ejercicio
--
-- Modelo:
--   benchmarking_benchs        un bench (interno o externo), con su minuta
--   benchmarking_evidencias    fotos / archivos del bench (se agregan después)
--   benchmarking_aplicaciones  qué aplicamos a raíz del bench y sobre qué
--                              indicador se mide la mejora (R5.2.4)
--   benchmarking_aplicaciones_valores  serie mensual manual para indicadores
--                              que no están en el Cuadro mensual
--
-- Aditiva e idempotente: se puede correr más de una vez.
BEGIN;

-- 1. Benchs
CREATE TABLE IF NOT EXISTS benchmarking_benchs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL CHECK (tipo IN ('interno','externo')),
  titulo         text NOT NULL,
  fecha          date NOT NULL DEFAULT CURRENT_DATE,
  contraparte    text,            -- con quién: CD, empresa, o equipos comparados
  modalidad      text NOT NULL DEFAULT 'visita' CHECK (modalidad IN ('visita','virtual','intercambio_datos','analisis_interno')),
  lugar          text,
  participantes  text,            -- quiénes fueron / participaron (texto libre)
  objetivo       text,            -- por qué se hizo (qué KPI no llega)
  temas          text,            -- minuta: qué temas se vieron
  conclusiones   text,            -- qué aprendimos / qué hacen distinto
  indicadores    text[] NOT NULL DEFAULT '{}',  -- KPIs mirados (TLP, RMD, rechazos...)
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS benchmarking_benchs_tipo_fecha_idx ON benchmarking_benchs(tipo, fecha DESC);

-- 2. Evidencias (fotos, actas, planillas) del bench
CREATE TABLE IF NOT EXISTS benchmarking_evidencias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bench_id    uuid NOT NULL REFERENCES benchmarking_benchs(id) ON DELETE CASCADE,
  path        text NOT NULL,      -- path dentro del bucket 'benchmarking'
  nombre      text NOT NULL,
  mime        text,
  bytes       bigint,
  descripcion text,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS benchmarking_evidencias_bench_idx ON benchmarking_evidencias(bench_id, created_at DESC);

-- 3. Aplicaciones: qué cambiamos a partir del bench y cómo se mide
CREATE TABLE IF NOT EXISTS benchmarking_aplicaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bench_id          uuid NOT NULL REFERENCES benchmarking_benchs(id) ON DELETE CASCADE,
  titulo            text NOT NULL,          -- qué aplicamos
  descripcion       text,                   -- cómo (proceso / SOP tocado)
  proceso           text,                   -- proceso o SOP afectado
  responsable       text,
  estado            text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('propuesta','en_curso','aplicada','descartada')),
  fecha_aplicacion  date,                   -- desde cuándo está aplicado (mes base de la comparación)
  -- Indicador que mide la mejora:
  --   indicador_id = id del Cuadro mensual (serie automática) o NULL (serie manual)
  indicador_id      text,
  indicador_nombre  text,                   -- nombre cuando es manual (o copia del cuadro)
  unidad            text,
  mejor_si          text NOT NULL DEFAULT 'menor' CHECK (mejor_si IN ('mayor','menor')),
  meta              numeric(14,2),
  resultado         text,                   -- lectura del resultado (texto)
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS benchmarking_aplicaciones_bench_idx ON benchmarking_aplicaciones(bench_id);

-- 4. Serie mensual manual (para indicadores fuera del Cuadro mensual: TLP, RMD, NPS...)
CREATE TABLE IF NOT EXISTS benchmarking_aplicaciones_valores (
  aplicacion_id uuid NOT NULL REFERENCES benchmarking_aplicaciones(id) ON DELETE CASCADE,
  mes           text NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  valor         numeric(14,2),
  nota          text,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aplicacion_id, mes)
);

-- 5. RLS: leen todos los autenticados, editan admin / supervisor / admin_rrhh
CREATE OR REPLACE FUNCTION es_editor_benchmarking() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')
  );
$$;

ALTER TABLE benchmarking_benchs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarking_evidencias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarking_aplicaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarking_aplicaciones_valores  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmarking_benchs_select" ON benchmarking_benchs;
CREATE POLICY "benchmarking_benchs_select" ON benchmarking_benchs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "benchmarking_benchs_write" ON benchmarking_benchs;
CREATE POLICY "benchmarking_benchs_write" ON benchmarking_benchs FOR ALL TO authenticated
  USING (es_editor_benchmarking()) WITH CHECK (es_editor_benchmarking());

DROP POLICY IF EXISTS "benchmarking_evidencias_select" ON benchmarking_evidencias;
CREATE POLICY "benchmarking_evidencias_select" ON benchmarking_evidencias FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "benchmarking_evidencias_write" ON benchmarking_evidencias;
CREATE POLICY "benchmarking_evidencias_write" ON benchmarking_evidencias FOR ALL TO authenticated
  USING (es_editor_benchmarking()) WITH CHECK (es_editor_benchmarking());

DROP POLICY IF EXISTS "benchmarking_aplicaciones_select" ON benchmarking_aplicaciones;
CREATE POLICY "benchmarking_aplicaciones_select" ON benchmarking_aplicaciones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "benchmarking_aplicaciones_write" ON benchmarking_aplicaciones;
CREATE POLICY "benchmarking_aplicaciones_write" ON benchmarking_aplicaciones FOR ALL TO authenticated
  USING (es_editor_benchmarking()) WITH CHECK (es_editor_benchmarking());

DROP POLICY IF EXISTS "benchmarking_valores_select" ON benchmarking_aplicaciones_valores;
CREATE POLICY "benchmarking_valores_select" ON benchmarking_aplicaciones_valores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "benchmarking_valores_write" ON benchmarking_aplicaciones_valores;
CREATE POLICY "benchmarking_valores_write" ON benchmarking_aplicaciones_valores FOR ALL TO authenticated
  USING (es_editor_benchmarking()) WITH CHECK (es_editor_benchmarking());

GRANT SELECT ON benchmarking_benchs, benchmarking_evidencias, benchmarking_aplicaciones, benchmarking_aplicaciones_valores TO authenticated;
GRANT INSERT, UPDATE, DELETE ON benchmarking_benchs, benchmarking_evidencias, benchmarking_aplicaciones, benchmarking_aplicaciones_valores TO authenticated;
GRANT ALL ON benchmarking_benchs, benchmarking_evidencias, benchmarking_aplicaciones, benchmarking_aplicaciones_valores TO service_role;

-- 6. Storage: bucket privado para fotos y archivos del bench
INSERT INTO storage.buckets (id, name, public) VALUES ('benchmarking', 'benchmarking', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "benchmarking_storage_select" ON storage.objects;
CREATE POLICY "benchmarking_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'benchmarking');
DROP POLICY IF EXISTS "benchmarking_storage_insert" ON storage.objects;
CREATE POLICY "benchmarking_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'benchmarking' AND es_editor_benchmarking());
DROP POLICY IF EXISTS "benchmarking_storage_delete" ON storage.objects;
CREATE POLICY "benchmarking_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'benchmarking' AND es_editor_benchmarking());

COMMIT;

NOTIFY pgrst, 'reload schema';
