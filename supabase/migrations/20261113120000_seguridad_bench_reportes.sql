-- Reporte Bench de Seguridad (Etapa 1 de las reuniones, debajo de la pirámide).
-- Cada día se adjunta una investigación/alerta de seguridad ocurrida en OTRO
-- distribuidor; en la reunión se trabaja y se vuelca qué aprendemos para
-- Entrega (distribución) y para Almacén (depósito). El archivo (PDF o imagen)
-- va al bucket privado "reuniones" (path bench-seguridad/<fecha>/...) y se
-- muestra con URL firmada.
CREATE TABLE IF NOT EXISTS seguridad_bench_reportes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  titulo text NOT NULL,
  distribuidor text,
  clasificacion text,
  resumen text,
  archivo_path text NOT NULL,
  archivo_nombre text,
  archivo_tipo text,
  aprendizaje_entrega text,
  aprendizaje_almacen text,
  creado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seguridad_bench_reportes_fecha
  ON seguridad_bench_reportes(fecha DESC);

ALTER TABLE seguridad_bench_reportes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seguridad_bench_read" ON seguridad_bench_reportes;
CREATE POLICY "seguridad_bench_read" ON seguridad_bench_reportes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "seguridad_bench_write" ON seguridad_bench_reportes;
CREATE POLICY "seguridad_bench_write" ON seguridad_bench_reportes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
