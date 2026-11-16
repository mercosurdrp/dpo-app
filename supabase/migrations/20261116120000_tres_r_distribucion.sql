-- =============================================
-- 3R de DISTRIBUCIÓN (bimestral) — choferes y ayudantes en un mismo ranking
-- - tres_r_dist_config: fórmula editable (pesos, topes, mínimos)
-- - tres_r_dist_raspones: raspones con el camión cargados a mano por
--   persona y bimestre (default 0; 1 raspón deja fuera del premio)
-- Los ganadores se guardan en s5_ayudantes_premios con area='distribucion'
-- (ya existe). Aplicar SOLO en la Supabase de Pampeana: el código se gatea
-- con IS_MISIONES.
-- =============================================

CREATE TABLE IF NOT EXISTS tres_r_dist_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  peso_rechazo NUMERIC NOT NULL DEFAULT 30,
  peso_rmd NUMERIC NOT NULL DEFAULT 25,
  peso_reportes NUMERIC NOT NULL DEFAULT 15,
  peso_presentismo NUMERIC NOT NULL DEFAULT 15,
  peso_5s NUMERIC NOT NULL DEFAULT 10,
  peso_tml NUMERIC NOT NULL DEFAULT 5,
  -- % de rechazo imputable (bultos) que deja el componente en 0 pts
  tope_rechazo NUMERIC NOT NULL DEFAULT 3,
  -- RMD: piso (0 pts) y techo (100 pts), en estrellas. Piso alto a propósito:
  -- en sep-oct 2026 todos los choferes estaban entre 4,96 y 5.
  rmd_piso NUMERIC NOT NULL DEFAULT 4.8,
  rmd_techo NUMERIC NOT NULL DEFAULT 5,
  -- reportes de seguridad en el bimestre que valen 100 pts
  tope_reportes NUMERIC NOT NULL DEFAULT 3,
  -- mínimo de reportes para poder entrar al podio
  min_reportes INT NOT NULL DEFAULT 1,
  tipos_reporte TEXT[] NOT NULL DEFAULT ARRAY['acto_inseguro','acto_seguro','ruta_riesgo'],
  -- días de licencia en el bimestre que dejan presentismo en 0 pts
  tope_dias_licencia NUMERIC NOT NULL DEFAULT 10,
  -- motivos de ausentismo que dejan fuera del podio
  motivos_descalifican TEXT[] NOT NULL DEFAULT ARRAY['ausencia','suspension'],
  -- TML: hasta la meta vale 100, en el tope vale 0
  tml_meta NUMERIC NOT NULL DEFAULT 25,
  tml_tope NUMERIC NOT NULL DEFAULT 45,
  -- % de los días hábiles (lun-sáb) del bimestre que hay que haber salido
  min_pct_dias NUMERIC NOT NULL DEFAULT 50,
  meses_ventana INT NOT NULL DEFAULT 2 CHECK (meses_ventana BETWEEN 1 AND 6),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

INSERT INTO tres_r_dist_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tres_r_dist_raspones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_desde DATE NOT NULL,              -- primer mes del bimestre (día 01)
  empleado_id UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (periodo_desde, empleado_id)
);

DROP TRIGGER IF EXISTS trg_tres_r_dist_config_updated_at ON tres_r_dist_config;
CREATE TRIGGER trg_tres_r_dist_config_updated_at
  BEFORE UPDATE ON tres_r_dist_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tres_r_dist_raspones_updated_at ON tres_r_dist_raspones;
CREATE TRIGGER trg_tres_r_dist_raspones_updated_at
  BEFORE UPDATE ON tres_r_dist_raspones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE tres_r_dist_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tres_r_dist_raspones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tres_r_dist_config_read" ON tres_r_dist_config;
CREATE POLICY "tres_r_dist_config_read"
  ON tres_r_dist_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tres_r_dist_config_write" ON tres_r_dist_config;
CREATE POLICY "tres_r_dist_config_write"
  ON tres_r_dist_config FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor'))
  );

-- Raspones: los ve y los carga sólo gestión (el empleado no los lee: el
-- portal arma su vista con el cliente admin y no muestra los ajenos).
DROP POLICY IF EXISTS "tres_r_dist_raspones_read" ON tres_r_dist_raspones;
CREATE POLICY "tres_r_dist_raspones_read"
  ON tres_r_dist_raspones FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor','supervisor'))
  );

DROP POLICY IF EXISTS "tres_r_dist_raspones_write" ON tres_r_dist_raspones;
CREATE POLICY "tres_r_dist_raspones_write"
  ON tres_r_dist_raspones FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor','supervisor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin','auditor','supervisor'))
  );
