-- =============================================
-- 5S: catálogo persistente de sectores de almacén
-- Reemplaza el uso de s5_sector_responsables.nombre
-- (ese campo se reseteaba mes a mes).
-- =============================================

CREATE TABLE s5_sectores_almacen (
  numero INT PRIMARY KEY CHECK (numero BETWEEN 1 AND 4),
  nombre TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_s5_sectores_almacen_updated_at
  BEFORE UPDATE ON s5_sectores_almacen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_sectores_almacen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_sectores_almacen_read"
  ON s5_sectores_almacen FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_sectores_almacen_update"
  ON s5_sectores_almacen FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','auditor')
    )
  );

INSERT INTO s5_sectores_almacen (numero, nombre) VALUES
  (1, 'Almacén'),
  (2, 'Picking/Stay'),
  (3, 'Nave'),
  (4, 'Espacios externos');
