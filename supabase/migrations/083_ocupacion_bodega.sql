-- =============================================
-- 083 · Ocupación de Bodega (CEq)
-- =============================================
-- Modela el indicador OB del pilar Entrega 1.2 (EN RUTA):
--   CEq = 120 / bultosPallet(SKU) × cantidadesTotal(SKU)   (por línea de venta)
--   CEq por viaje = Σ CEq de las líneas FCVTA del (patente, día)
--   Target: 450 CEq por viaje
--
-- Necesitamos dos tablas auxiliares:
--   1) chess_articulos   → maestro de SKU sincronizado de Chess. Sólo guardamos
--                          lo necesario para el cálculo: idArticulo, descripción,
--                          bultosPallet, unidadesBulto, valorUnidadMedida.
--   2) ocupacion_bodega_diaria → acumulado por (fecha, patente) con CEq, bultos,
--                          hl, líneas, skus. Lo alimenta el sync diario de rechazos.
--
-- Aditivo e idempotente. Aplica en Pampeana. Misiones no usa OB (no Chess Pampeana).
-- =============================================

BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 1) chess_articulos — maestro de SKU
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS chess_articulos (
  id_articulo         INTEGER PRIMARY KEY,
  des_articulo        TEXT,
  des_corta           TEXT,
  bultos_pallet       INTEGER,
  unidades_bulto      INTEGER,
  valor_unidad_medida NUMERIC(10, 4),
  peso_bulto          NUMERIC(10, 4),
  des_unidad_medida   TEXT,
  anulado             BOOLEAN NOT NULL DEFAULT false,
  -- factor CEq precalculado para queries rápidas: 120/bultos_pallet
  ceq_factor          NUMERIC(12, 6) GENERATED ALWAYS AS (
    CASE WHEN bultos_pallet IS NOT NULL AND bultos_pallet > 0
         THEN 120.0 / bultos_pallet
         ELSE 0
    END
  ) STORED,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chess_articulos_bp ON chess_articulos(bultos_pallet);
CREATE INDEX IF NOT EXISTS idx_chess_articulos_anulado ON chess_articulos(anulado);

DROP TRIGGER IF EXISTS trg_chess_articulos_updated_at ON chess_articulos;
CREATE TRIGGER trg_chess_articulos_updated_at BEFORE UPDATE ON chess_articulos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------
-- 2) ocupacion_bodega_diaria — agregado por (fecha, patente)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS ocupacion_bodega_diaria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         DATE NOT NULL,
  patente       TEXT NOT NULL,   -- ds_fletero_carga de Chess
  ceq_total     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  bultos_total  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  hl_total      NUMERIC(12, 4) NOT NULL DEFAULT 0,
  lineas        INTEGER NOT NULL DEFAULT 0,
  skus_distintos INTEGER NOT NULL DEFAULT 0,
  -- OB% relativo a target (default 450). Persistido para queries rápidas.
  ob_pct_target NUMERIC(7, 2) GENERATED ALWAYS AS (
    CASE WHEN ceq_total > 0 THEN (ceq_total / 450.0) * 100.0 ELSE 0 END
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fecha, patente)
);

CREATE INDEX IF NOT EXISTS idx_ob_diaria_fecha ON ocupacion_bodega_diaria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ob_diaria_patente ON ocupacion_bodega_diaria(patente);

DROP TRIGGER IF EXISTS trg_ob_diaria_updated_at ON ocupacion_bodega_diaria;
CREATE TRIGGER trg_ob_diaria_updated_at BEFORE UPDATE ON ocupacion_bodega_diaria
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------
-- 3) RLS — lectura para autenticados; escritura admin/supervisor (sync).
-- ---------------------------------------------
ALTER TABLE chess_articulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chess_articulos_read" ON chess_articulos;
CREATE POLICY "chess_articulos_read" ON chess_articulos
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "chess_articulos_admin" ON chess_articulos;
CREATE POLICY "chess_articulos_admin" ON chess_articulos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
GRANT ALL ON chess_articulos TO anon, authenticated, service_role;

ALTER TABLE ocupacion_bodega_diaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ob_diaria_read" ON ocupacion_bodega_diaria;
CREATE POLICY "ob_diaria_read" ON ocupacion_bodega_diaria
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ob_diaria_admin" ON ocupacion_bodega_diaria;
CREATE POLICY "ob_diaria_admin" ON ocupacion_bodega_diaria
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
GRANT ALL ON ocupacion_bodega_diaria TO anon, authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
