-- 5S: elegibles del sorteo mensual + responsable snapshot en la auditoría

ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS s5_elegible BOOLEAN NOT NULL DEFAULT false;

-- Los 6 operarios de depósito que hoy entran al sorteo (por LEGAJO, que es la
-- clave: aparear por nombre es frágil y dejaría el sorteo sin universo).
UPDATE empleados SET s5_elegible = true
WHERE activo = true
  AND legajo IN (36467481, 107, 30, 43907801, 112, 425283564);

ALTER TABLE s5_auditorias
  ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES empleados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_s5_auditorias_responsable
  ON s5_auditorias(responsable_id);

-- Backfill: las auditorías ya cargadas (abril→julio 2026) toman el responsable
-- designado de su mes y sector.
UPDATE s5_auditorias a
SET responsable_id = r.empleado_id
FROM s5_sector_responsables r
WHERE a.tipo = 'almacen' AND a.responsable_id IS NULL
  AND a.periodo = r.periodo AND a.sector_numero = r.sector_numero;
