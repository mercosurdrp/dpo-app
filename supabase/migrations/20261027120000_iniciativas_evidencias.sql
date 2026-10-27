-- Iniciativas de ahorro: evidencias de la iniciativa entera, y se miran por mes.
--
-- 1) Nueva tabla presupuestos_iniciativas_evidencias: archivos que respaldan
--    la iniciativa completa (el resumen de Axion con el precio del gasoil, la
--    cotización de los limitadores, el acta con Ventas), no un trimestre.
-- 2) Los avances trimestrales (Q1-Q4) salieron de la app el 16/09/2026
--    (commit c9f5ffce): el ahorro de cada mes se calcula solo (EERR del rubro,
--    registro de combustible o Foxtrot). La tabla quedó con 3 filas viejas que
--    nadie leía (Colón Q3, limitadores Q2 y Q3). La evidencia del Q2 de
--    limitadores (MERCOSUR JUL.pdf) pasa a la iniciativa y la tabla cae.

BEGIN;

CREATE TABLE IF NOT EXISTS presupuestos_iniciativas_evidencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciativa_id uuid NOT NULL REFERENCES presupuestos_iniciativas(id) ON DELETE CASCADE,
  archivo_url   text NOT NULL,   -- path dentro del bucket 'presupuestos'
  nombre        text NOT NULL,   -- nombre original del archivo
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presup_inic_evid_iniciativa
  ON presupuestos_iniciativas_evidencias(iniciativa_id);

ALTER TABLE presupuestos_iniciativas_evidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presup_inic_evid_select_auth" ON presupuestos_iniciativas_evidencias;
CREATE POLICY "presup_inic_evid_select_auth"
  ON presupuestos_iniciativas_evidencias FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presup_inic_evid_write_editors" ON presupuestos_iniciativas_evidencias;
CREATE POLICY "presup_inic_evid_write_editors"
  ON presupuestos_iniciativas_evidencias FOR ALL TO authenticated
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

-- Las evidencias que estaban colgadas de un trimestre pasan a la iniciativa.
INSERT INTO presupuestos_iniciativas_evidencias
  (iniciativa_id, archivo_url, nombre, created_by, created_at)
SELECT iniciativa_id,
       evidencia_url,
       coalesce(nullif(evidencia_nombre, ''), evidencia_url),
       created_by,
       created_at
FROM presupuestos_iniciativas_seguimiento
WHERE evidencia_url IS NOT NULL;

DROP TABLE IF EXISTS presupuestos_iniciativas_seguimiento;

COMMIT;
