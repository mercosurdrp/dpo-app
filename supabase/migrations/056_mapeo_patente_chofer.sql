-- =============================================================
-- 056 — mapeo_patente_chofer: fallback manual cuando Foxtrot no resuelve
-- =============================================================
-- Foxtrot enriquece chofer por patente via /routes/find_by_date. Cuando
-- no devuelve (ruta sin chofer asignado, vehículo no en Foxtrot, etc.),
-- el sync busca acá. Si tampoco hay, queda ds_fletero_carga como display.
-- Prioridad final en queries: COALESCE(foxtrot, mapeo_manual, patente).
-- Se gestiona desde un admin simple (NO el role admin_rrhh que no existe
-- en Pampeana — solo `admin`).

CREATE TABLE IF NOT EXISTS mapeo_patente_chofer (
  patente     TEXT PRIMARY KEY,
  chofer_id   UUID REFERENCES catalogo_choferes(id) ON DELETE SET NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at (función específica de la tabla, siguiendo el patrón
-- usado por 018_tml_plan_accion.sql y 041_orden_salida.sql, ya que no hay
-- una set_updated_at() global en este Supabase).
CREATE OR REPLACE FUNCTION mapeo_patente_chofer_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mapeo_patente_chofer_updated_at ON mapeo_patente_chofer;
CREATE TRIGGER trg_mapeo_patente_chofer_updated_at
  BEFORE UPDATE ON mapeo_patente_chofer
  FOR EACH ROW EXECUTE FUNCTION mapeo_patente_chofer_set_updated_at();

ALTER TABLE mapeo_patente_chofer ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier authenticated (el sync usa service_role, pero la UI
-- de admin lee con sesión).
DROP POLICY IF EXISTS "mapeo_patente_chofer_read_authenticated" ON mapeo_patente_chofer;
CREATE POLICY "mapeo_patente_chofer_read_authenticated" ON mapeo_patente_chofer
  FOR SELECT TO authenticated USING (true);

-- Escritura: solo rol 'admin' (Pampeana no tiene 'admin_rrhh').
DROP POLICY IF EXISTS "mapeo_patente_chofer_write_admin" ON mapeo_patente_chofer;
CREATE POLICY "mapeo_patente_chofer_write_admin" ON mapeo_patente_chofer
  FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Service role: full access (sync + scripts de mantenimiento)
DROP POLICY IF EXISTS "mapeo_patente_chofer_all_service" ON mapeo_patente_chofer;
CREATE POLICY "mapeo_patente_chofer_all_service" ON mapeo_patente_chofer
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed con las 11 patentes activas en rechazos de abril 2026 (Pampeana).
-- chofer_id queda NULL — los completa el admin a mano. Se omiten
-- "SEGUNDA VUELTA" y "MOSTRADOR RAMALLO" porque no son patentes reales.
INSERT INTO mapeo_patente_chofer (patente, chofer_id, activo, notes) VALUES
  ('AF028YB', NULL, true, NULL),
  ('AF469UR', NULL, true, NULL),
  ('OJA403',  NULL, true, NULL),
  ('AF664NY', NULL, true, NULL),
  ('AE908DG', NULL, true, NULL),
  ('AE908DH', NULL, true, NULL),
  ('AE908DF', NULL, true, NULL),
  ('AF399KY', NULL, true, NULL),
  ('AE591EI', NULL, true, NULL),
  ('AF588SU', NULL, true, NULL),
  ('AC165AJ', NULL, true, NULL)
ON CONFLICT (patente) DO NOTHING;
