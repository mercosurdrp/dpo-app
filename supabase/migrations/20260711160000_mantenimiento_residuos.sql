-- =============================================
-- Disposición de residuos de mantenimiento (DPO Flota 1.4):
-- registro electrónico de cada eliminación con fecha, material, proveedor y
-- certificado de descarte adjunto; para neumáticos, números de fuego.
-- Sub-tab "Residuos" en la pestaña Repuestos de /vehiculos/mantenimiento.
-- =============================================

CREATE TABLE mantenimiento_residuos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  material TEXT NOT NULL CHECK (material IN (
    'neumaticos', 'aceite', 'filtros', 'baterias', 'chatarra', 'otros'
  )),
  descripcion TEXT,
  cantidad NUMERIC,
  unidad TEXT,                 -- un | lts | kg
  proveedor TEXT NOT NULL,
  numeros_fuego TEXT,          -- solo neumáticos: números de fuego eliminados
  certificado_url TEXT,
  certificado_path TEXT,
  observaciones TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mtto_residuos_fecha ON mantenimiento_residuos(fecha DESC);

ALTER TABLE mantenimiento_residuos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mtto_residuos_read" ON mantenimiento_residuos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mtto_residuos_insert" ON mantenimiento_residuos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mtto_residuos_delete" ON mantenimiento_residuos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));
