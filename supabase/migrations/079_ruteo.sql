-- =============================================
-- 079 · Ruteo (cierre diario de reparto) — feature Pampeana-only
-- =============================================
-- Una fila por DÍA. El "ruteador" toca INICIO DE RUTEO (registra hora_inicio
-- real del clic), luego FIN DE RUTEO (registra hora_fin real + carga la
-- cantidad de bultos y clientes desglosada por ciudad). Ciudades fijas de
-- Pampeana: Pergamino y Ramallo.
--
-- Aplicar SOLO en la Supabase de Pampeana (dpo-app-self). El código se gatea
-- con IS_MISIONES para que el deploy compartido de Misiones nunca consulte
-- esta tabla (no crearla allá).
--
-- Idempotente (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS). RLS inline
-- sobre profiles.role (sin auth_role() ni enums, patrón portable 017/078).
-- =============================================

BEGIN;

-- Helper updated_at (por si no existiera en este tenant). Idéntico al de 001.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ruteo_cierres (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL DEFAULT CURRENT_DATE,
  estado             TEXT NOT NULL DEFAULT 'en_curso'
                       CHECK (estado IN ('en_curso','cerrado')),
  hora_inicio        TIMESTAMPTZ NOT NULL DEFAULT now(),  -- timestamp real del clic INICIO
  hora_fin           TIMESTAMPTZ,                          -- timestamp real del clic FIN
  pergamino_bultos   INT NOT NULL DEFAULT 0 CHECK (pergamino_bultos   >= 0),
  pergamino_clientes INT NOT NULL DEFAULT 0 CHECK (pergamino_clientes >= 0),
  ramallo_bultos     INT NOT NULL DEFAULT 0 CHECK (ramallo_bultos     >= 0),
  ramallo_clientes   INT NOT NULL DEFAULT 0 CHECK (ramallo_clientes   >= 0),
  notas              TEXT,
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- un cierre por día
  CONSTRAINT ruteo_cierres_fecha_unica UNIQUE (fecha),
  -- si está cerrado, debe tener hora_fin
  CONSTRAINT ruteo_cierres_cerrado_ok
    CHECK (estado <> 'cerrado' OR hora_fin IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ruteo_cierres_fecha ON ruteo_cierres(fecha DESC);

DROP TRIGGER IF EXISTS trg_ruteo_cierres_updated_at ON ruteo_cierres;
CREATE TRIGGER trg_ruteo_cierres_updated_at
  BEFORE UPDATE ON ruteo_cierres
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ruteo_cierres ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier autenticado (la page ya gatea por rol; lectura amplia es inocua).
DROP POLICY IF EXISTS "ruteo_cierres_read" ON ruteo_cierres;
CREATE POLICY "ruteo_cierres_read"
  ON ruteo_cierres FOR SELECT TO authenticated USING (true);

-- Escritura (insert/update/delete): solo admin y supervisor.
DROP POLICY IF EXISTS "ruteo_cierres_write_admin_sup" ON ruteo_cierres;
CREATE POLICY "ruteo_cierres_write_admin_sup"
  ON ruteo_cierres FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p
                 WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p
                 WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')));

COMMIT;

NOTIFY pgrst, 'reload schema';
