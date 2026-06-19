-- =============================================
-- 136 · Inversiones del Presupuesto
-- =============================================
-- Solapa nueva dentro del módulo /presupuesto (solo Pampeana).
-- Registro de inversiones futuras: qué se planea invertir, fecha programada,
-- monto estimado, beneficio esperado (texto + KPI cuantificado), y al
-- realizarse: fecha real, monto real ("cuánto salió") y la factura/cotización.
--
-- Reusa: bucket de storage 'presupuestos', función update_updated_at(),
--        roles editores (admin / supervisor / admin_rrhh).
-- Una sola tabla (sin sub-filas).
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS presupuestos_inversiones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio              int  NOT NULL,
  titulo            text NOT NULL,
  -- Categoría: catálogo fijo + 'otro'
  categoria         text NOT NULL DEFAULT 'otro'
                      CHECK (categoria IN (
                        'flota',
                        'equipos_almacen',
                        'tecnologia',
                        'infraestructura',
                        'otro'
                      )),
  cantidad          int,              -- cantidad de unidades (ej. 2 autoelevadores)
  descripcion       text,
  beneficio_esperado text,            -- beneficio en texto
  -- Beneficio cuantificado (KPI esperado)
  kpi_nombre        text,             -- ej. "Disponibilidad", "Productividad picking"
  kpi_unidad        text,             -- ej. "%", "líneas/HH"
  kpi_objetivo      numeric(14,4),    -- valor esperado con la inversión
  proveedor         text,
  fecha_programada  date,
  monto_estimado    numeric(14,2),    -- inversión programada
  estado            text NOT NULL DEFAULT 'programada'
                      CHECK (estado IN (
                        'programada',
                        'aprobada',
                        'en_curso',
                        'realizada',
                        'cancelada'
                      )),
  fecha_realizada   date,             -- cuándo se concretó
  monto_real        numeric(14,2),    -- cuánto salió finalmente
  evidencia_url     text,             -- cotización / factura en storage
  evidencia_nombre  text,
  responsable_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  observaciones     text,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presup_inversiones_anio        ON presupuestos_inversiones(anio);
CREATE INDEX IF NOT EXISTS idx_presup_inversiones_categoria   ON presupuestos_inversiones(categoria);
CREATE INDEX IF NOT EXISTS idx_presup_inversiones_estado      ON presupuestos_inversiones(estado);
CREATE INDEX IF NOT EXISTS idx_presup_inversiones_responsable ON presupuestos_inversiones(responsable_id);

-- RLS
ALTER TABLE presupuestos_inversiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presup_inversiones_select_auth" ON presupuestos_inversiones;
CREATE POLICY "presup_inversiones_select_auth"
  ON presupuestos_inversiones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "presup_inversiones_write_editors" ON presupuestos_inversiones;
CREATE POLICY "presup_inversiones_write_editors"
  ON presupuestos_inversiones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

GRANT ALL ON presupuestos_inversiones TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_presup_inversiones_updated_at ON presupuestos_inversiones;
CREATE TRIGGER trg_presup_inversiones_updated_at
  BEFORE UPDATE ON presupuestos_inversiones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
