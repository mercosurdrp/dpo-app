-- =============================================================
-- CREAR TABLAS RECHAZOS + VENTAS_DIARIAS + DPO_KPIS EN MISIONES
-- Proyecto Supabase: bvqmsrnrdrxprbggfziu
-- Pegar TODO este archivo en:
--   https://supabase.com/dashboard/project/bvqmsrnrdrxprbggfziu/sql/new
-- Schema validado contra Pampeana (tpafgmbhnucdiavvxbcg) el 2026-04-29
-- =============================================================

-- ============= TABLA: rechazos =============
CREATE TABLE rechazos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  serie INT,
  nrodoc INT NOT NULL,
  id_articulo INT NOT NULL,
  ds_articulo TEXT,
  id_fletero_carga INT,
  ds_fletero_carga TEXT,
  id_rechazo INT NOT NULL,
  ds_rechazo TEXT,
  bultos_rechazados NUMERIC NOT NULL DEFAULT 0,
  bultos_entregados NUMERIC NOT NULL DEFAULT 0,
  id_cliente INT,
  nombre_cliente TEXT,
  id_vendedor INT,
  ds_vendedor TEXT,
  planilla_carga TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(serie, nrodoc, id_articulo)
);

CREATE INDEX idx_rechazos_fecha ON rechazos(fecha);
CREATE INDEX idx_rechazos_fletero ON rechazos(id_fletero_carga);
CREATE INDEX idx_rechazos_ds_fletero ON rechazos(ds_fletero_carga);
CREATE INDEX idx_rechazos_id_rechazo ON rechazos(id_rechazo);
CREATE INDEX idx_rechazos_cliente ON rechazos(id_cliente);

ALTER TABLE rechazos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rechazos_read_authenticated" ON rechazos FOR SELECT TO authenticated USING (true);
CREATE POLICY "rechazos_all_service" ON rechazos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============= TABLA: ventas_diarias =============
CREATE TABLE ventas_diarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  ds_fletero_carga TEXT NOT NULL,
  total_bultos NUMERIC NOT NULL DEFAULT 0,
  total_unidades NUMERIC NOT NULL DEFAULT 0,
  total_hl NUMERIC NOT NULL DEFAULT 0,
  viajes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fecha, ds_fletero_carga)
);

CREATE INDEX idx_ventas_diarias_fecha ON ventas_diarias(fecha);

ALTER TABLE ventas_diarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ventas_diarias_read_authenticated" ON ventas_diarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "ventas_diarias_all_service" ON ventas_diarias FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============= TABLA: dpo_kpis =============
CREATE TABLE dpo_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes INT NOT NULL,
  anio INT NOT NULL,
  numero INT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  es_auto BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mes, anio, numero)
);

CREATE INDEX idx_dpo_kpis_mes_anio ON dpo_kpis(mes, anio);

ALTER TABLE dpo_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dpo_kpis_read_authenticated" ON dpo_kpis FOR SELECT TO authenticated USING (true);
CREATE POLICY "dpo_kpis_write_authenticated" ON dpo_kpis FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dpo_kpis_all_service" ON dpo_kpis FOR ALL TO service_role USING (true) WITH CHECK (true);
