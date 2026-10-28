-- Conclusión escrita del mapa de Costo por PDV, una por período (mes cargado o
-- acumulado del año). Queda pegada a la foto del período como evidencia de la
-- lectura de gestión y se muestra también en la Reunión de Presupuesto.

CREATE TABLE IF NOT EXISTS costo_pdv_mapa_conclusiones (
  -- Misma clave que la foto: costo-pdv-mapa-YYYY-MM o costo-pdv-mapa-YYYY-ytd.
  clave text PRIMARY KEY,
  anio integer NOT NULL,
  mes integer CHECK (mes BETWEEN 1 AND 12),   -- NULL = acumulado del año
  texto text NOT NULL,
  autor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  autor_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS costo_pdv_mapa_conclusiones_periodo_idx
  ON costo_pdv_mapa_conclusiones (anio, mes);

DROP TRIGGER IF EXISTS trg_costo_pdv_mapa_conclusiones_updated_at
  ON costo_pdv_mapa_conclusiones;
CREATE TRIGGER trg_costo_pdv_mapa_conclusiones_updated_at
  BEFORE UPDATE ON costo_pdv_mapa_conclusiones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE costo_pdv_mapa_conclusiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "costo_pdv_mapa_conclusiones_read" ON costo_pdv_mapa_conclusiones;
CREATE POLICY "costo_pdv_mapa_conclusiones_read"
  ON costo_pdv_mapa_conclusiones
  FOR SELECT TO authenticated USING (true);

-- Escriben los mismos roles que cargan el costo mensual.
DROP POLICY IF EXISTS "costo_pdv_mapa_conclusiones_write" ON costo_pdv_mapa_conclusiones;
CREATE POLICY "costo_pdv_mapa_conclusiones_write"
  ON costo_pdv_mapa_conclusiones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

COMMENT ON TABLE costo_pdv_mapa_conclusiones IS
  'Conclusión de gestión del mapa de Costo por PDV, una por período (clave = la de la foto en indicadores_fotos).';
