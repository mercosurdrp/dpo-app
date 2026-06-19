-- =============================================
-- 119 · Iniciativas de Ahorro (Rutina de Campeones 5.2)
-- =============================================
-- Solapa nueva dentro del módulo /presupuesto.
-- Permite cargar iniciativas de ahorro y hacerles seguimiento TRIMESTRAL
-- para ver si realmente funcionaron (ahorro $ + KPI/métrica comprometida).
--
-- Handbook Pilar Planeamiento 5.2:
--   R5.2.1 rutina para plantear/definir iniciativas
--   R5.2.2 mostrar implementación del proyecto
--   R5.2.3 ahorros incluidos en el presupuesto (bloque 1)
--   R5.2.4 mostrar mejora de las métricas comprometidas
--
-- Modelo:
--   1) presupuestos_iniciativas             (cabecera de la iniciativa)
--   2) presupuestos_iniciativas_seguimiento (1 fila por trimestre: ahorro real + KPI)
--
-- Reusa: bucket de storage 'presupuestos', función update_updated_at(),
--        roles editores (admin / supervisor / admin_rrhh).
-- =============================================

BEGIN;

-- =============================================
-- 1) Cabecera de iniciativa
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_iniciativas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio                      int  NOT NULL,
  -- Tipo: catálogo fijo del Handbook + 'otro' (texto libre en tipo_otro)
  tipo                      text NOT NULL DEFAULT 'otro'
                              CHECK (tipo IN (
                                'hhee',                 -- Horas extras
                                'ausentismo',
                                'mermas_wh_del',        -- Mermas Warehouse / Delivery
                                'ocupacion_capacidad',
                                'productividad_wh_del',
                                'renovacion_flota',
                                'cambio_glp',
                                'consumo_combustible',
                                'otro'
                              )),
  tipo_otro                 text,           -- detalle cuando tipo = 'otro'
  titulo                    text NOT NULL,
  descripcion               text,
  responsable_id            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_implementacion      date,           -- cuándo entra en vigencia el proyecto
  -- Ahorro $ comprometido (financiero) — total anual estimado
  ahorro_comprometido_anual numeric(14,2),
  -- KPI / métrica comprometida (operativa)
  kpi_nombre                text,           -- ej. "% Ausentismo", "L/100 km"
  kpi_unidad                text,           -- ej. "%", "L/100km", "bultos/HH"
  kpi_linea_base            numeric(14,4),  -- valor ANTES de la iniciativa
  kpi_objetivo              numeric(14,4),  -- valor objetivo comprometido
  kpi_mejor_si              text NOT NULL DEFAULT 'menor'
                              CHECK (kpi_mejor_si IN ('menor', 'mayor')),
  -- R5.2.3: el ahorro está incluido en el presupuesto del bloque 1
  incluida_en_presupuesto   boolean NOT NULL DEFAULT false,
  estado                    text NOT NULL DEFAULT 'planificada'
                              CHECK (estado IN (
                                'planificada',
                                'en_implementacion',
                                'implementada',
                                'cancelada'
                              )),
  observaciones             text,
  created_by                uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presupuestos_iniciativas_anio
  ON presupuestos_iniciativas(anio);

CREATE INDEX IF NOT EXISTS idx_presupuestos_iniciativas_responsable
  ON presupuestos_iniciativas(responsable_id);

CREATE INDEX IF NOT EXISTS idx_presupuestos_iniciativas_estado
  ON presupuestos_iniciativas(estado);


-- =============================================
-- 2) Seguimiento trimestral
-- =============================================
CREATE TABLE IF NOT EXISTS presupuestos_iniciativas_seguimiento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciativa_id   uuid NOT NULL
                    REFERENCES presupuestos_iniciativas(id) ON DELETE CASCADE,
  anio            int  NOT NULL,
  trimestre       int  NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  ahorro_real     numeric(14,2),   -- ahorro $ efectivamente logrado en el Q
  kpi_valor       numeric(14,4),   -- valor de la métrica medido en el Q
  comentario      text,
  evidencia_url   text,
  evidencia_nombre text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (iniciativa_id, anio, trimestre)
);

CREATE INDEX IF NOT EXISTS idx_presup_inic_seg_iniciativa
  ON presupuestos_iniciativas_seguimiento(iniciativa_id);


-- =============================================
-- 3) RLS
-- =============================================
ALTER TABLE presupuestos_iniciativas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos_iniciativas_seguimiento ENABLE ROW LEVEL SECURITY;

-- ---- presupuestos_iniciativas ----
DROP POLICY IF EXISTS "presup_iniciativas_select_auth" ON presupuestos_iniciativas;
CREATE POLICY "presup_iniciativas_select_auth"
  ON presupuestos_iniciativas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presup_iniciativas_write_editors" ON presupuestos_iniciativas;
CREATE POLICY "presup_iniciativas_write_editors"
  ON presupuestos_iniciativas FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );

-- ---- presupuestos_iniciativas_seguimiento ----
DROP POLICY IF EXISTS "presup_inic_seg_select_auth" ON presupuestos_iniciativas_seguimiento;
CREATE POLICY "presup_inic_seg_select_auth"
  ON presupuestos_iniciativas_seguimiento FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presup_inic_seg_write_editors" ON presupuestos_iniciativas_seguimiento;
CREATE POLICY "presup_inic_seg_write_editors"
  ON presupuestos_iniciativas_seguimiento FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor', 'admin_rrhh'))
  );


-- =============================================
-- 4) GRANTs explícitos (cache PostgREST)
-- =============================================
GRANT ALL ON presupuestos_iniciativas             TO anon, authenticated, service_role;
GRANT ALL ON presupuestos_iniciativas_seguimiento TO anon, authenticated, service_role;


-- =============================================
-- 5) Triggers updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_presup_iniciativas_updated_at ON presupuestos_iniciativas;
CREATE TRIGGER trg_presup_iniciativas_updated_at
  BEFORE UPDATE ON presupuestos_iniciativas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_presup_inic_seg_updated_at ON presupuestos_iniciativas_seguimiento;
CREATE TRIGGER trg_presup_inic_seg_updated_at
  BEFORE UPDATE ON presupuestos_iniciativas_seguimiento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

-- Reload schema cache de PostgREST (fuera de transacción)
NOTIFY pgrst, 'reload schema';
