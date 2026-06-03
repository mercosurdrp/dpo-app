-- =============================================
-- 095 · Períodos Críticos R3.4.4 — Programa de incentivos de temporada alta
-- =============================================
-- Cumple R3.4.4 del manual ("el distribuidor puede mostrar PARTICIPACIÓN en el
-- programa de incentivos de temporada alta; el programa SE COMUNICA a todo el
-- equipo"). Nivel 1: documentar el programa (PPT + resumen), evidenciar la
-- comunicación al equipo, y registrar la participación/ganadores por mes.
--
-- pc_incentivos_programa: singleton (id=1) con el programa vigente + estado de
--   comunicación. Archivos al bucket público 'reuniones', prefijo 'incentivos-pc/'.
-- pc_incentivos_registro: seguimiento por (año, mes, ámbito) — cumplimiento de
--   KPIs habilitantes y ganadores.
-- RLS patrón pc_*. Idempotente. NOTIFY pgrst al final.
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS pc_incentivos_programa (
  id               INT PRIMARY KEY DEFAULT 1,
  nombre           TEXT NOT NULL DEFAULT 'Programa de Incentivos de Verano',
  periodo          TEXT NOT NULL DEFAULT 'Diciembre – Febrero',
  descripcion      TEXT NOT NULL DEFAULT '',
  archivo_path     TEXT,           -- la PPT del programa (bucket reuniones)
  archivo_nombre   TEXT,
  comunicado       BOOLEAN NOT NULL DEFAULT false,
  comunicado_fecha DATE,
  comunicado_path  TEXT,           -- evidencia de comunicación (foto/PPT/acta)
  comunicado_nombre TEXT,
  comunicado_nota  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pc_incentivos_programa_singleton CHECK (id = 1)
);

-- Semilla del programa vigente (datos de la PPT Mercosur 2025/2026)
INSERT INTO pc_incentivos_programa (id, descripcion)
VALUES (1,
  E'Premia a los equipos destacados en la temporada alta (Dic–Feb), época de alta demanda. Premio al finalizar la temporada.\n\n'
  || E'DELIVERY · Choferes (KPIs habilitantes mensuales por equipo):\n'
  || E'  • Rechazo ≤ 1%\n  • Foxtrot — Score de clickeo ≥ 95%\n  • Llegadas tarde + Ausentismos = 0\n  • (todo comportamiento inseguro descalifica)\n\n'
  || E'DELIVERY · Ayudantes:\n  • Sobrantes/Faltantes = 0\n  • 5S camión ≥ 90%\n  • Llegadas tarde = 0\n\n'
  || E'WAREHOUSE: Zona 5S · Comportamientos seguros · Picking (>15 paletas/HH, menos errores) · Clasificación de envases.\n\n'
  || E'Premios 1°/2°/3° con cajas de producto + merchandising.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pc_incentivos_registro (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio        INT  NOT NULL,
  mes         INT  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ambito      TEXT NOT NULL DEFAULT 'Choferes',  -- Choferes/Ayudantes/Warehouse
  equipo      TEXT,            -- equipo / persona destacada
  cumplio     BOOLEAN,         -- cumplió los KPIs habilitantes del mes
  posicion    TEXT,            -- 1°/2°/3° / ganador
  premio      TEXT,
  nota        TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pc_incentivos_registro_periodo ON pc_incentivos_registro(anio, mes);

DROP TRIGGER IF EXISTS trg_pc_incentivos_programa_updated_at ON pc_incentivos_programa;
CREATE TRIGGER trg_pc_incentivos_programa_updated_at
  BEFORE UPDATE ON pc_incentivos_programa FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_pc_incentivos_registro_updated_at ON pc_incentivos_registro;
CREATE TRIGGER trg_pc_incentivos_registro_updated_at
  BEFORE UPDATE ON pc_incentivos_registro FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE pc_incentivos_programa ENABLE ROW LEVEL SECURITY;
ALTER TABLE pc_incentivos_registro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_incentivos_programa_read" ON pc_incentivos_programa;
CREATE POLICY "pc_incentivos_programa_read" ON pc_incentivos_programa FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_incentivos_programa_write" ON pc_incentivos_programa;
CREATE POLICY "pc_incentivos_programa_write" ON pc_incentivos_programa FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','admin_rrhh','supervisor')));

DROP POLICY IF EXISTS "pc_incentivos_registro_read" ON pc_incentivos_registro;
CREATE POLICY "pc_incentivos_registro_read" ON pc_incentivos_registro FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pc_incentivos_registro_write" ON pc_incentivos_registro;
CREATE POLICY "pc_incentivos_registro_write" ON pc_incentivos_registro FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','admin_rrhh','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','admin_rrhh','supervisor')));

COMMIT;

NOTIFY pgrst, 'reload schema';
