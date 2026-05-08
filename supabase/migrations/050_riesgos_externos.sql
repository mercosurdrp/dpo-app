-- =============================================
-- 050 · Riesgos Externos — Plan de Acción
-- =============================================
-- Pilar Planeamiento, punto 2.2 (Evaluación de riesgos, respuesta y
-- reanudación del negocio). Bitácora de sucesos: cada fila es un evento
-- de riesgo externo con su tratamiento. Tipos de riesgo derivados de la
-- "Presentación Riesgo Externo 2026" + Matriz de Riesgo del CD.
-- =============================================

BEGIN;

-- =============================================
-- 1) Enums
-- =============================================
DO $$ BEGIN
  CREATE TYPE tipo_riesgo_externo AS ENUM (
    'corte_de_luz',
    'falla_en_generador',
    'corte_de_sistema',
    'corte_de_internet',
    'corte_de_ruta_o_acceso',
    'incendio',
    'paro_sindical',
    'emergencia_medica_interna',
    'emergencia_medica_externa',
    'temporal',
    'robo_warehouse',
    'robo_distribucion',
    'saqueos',
    'clausura_del_predio',
    'no_apertura_de_caja',
    'amenaza_de_bomba',
    'pandemia',
    'invasion_de_plagas'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_riesgo_externo AS ENUM (
    'no_iniciado',
    'en_curso',
    'concluido',
    'concluido_con_atraso',
    'atrasado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================
-- 2) Tabla principal
-- =============================================
CREATE SEQUENCE IF NOT EXISTS riesgos_externos_acciones_nro_seq START 1;

CREATE TABLE IF NOT EXISTS riesgos_externos_acciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_correlativo      int  NOT NULL UNIQUE
                         DEFAULT nextval('riesgos_externos_acciones_nro_seq'),
  tipo_riesgo          tipo_riesgo_externo NOT NULL,
  observaciones        text NOT NULL,
  resolucion           text,
  fecha_ocurrencia     date NOT NULL,
  responsable_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tarea_pendiente      text,
  fecha_compromiso     date,
  fecha_cierre_real    date,
  estado               estado_riesgo_externo NOT NULL DEFAULT 'no_iniciado',
  semana               int  GENERATED ALWAYS AS
                         (EXTRACT(WEEK FROM fecha_ocurrencia)::int) STORED,
  created_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE riesgos_externos_acciones_nro_seq
  OWNED BY riesgos_externos_acciones.nro_correlativo;

CREATE INDEX IF NOT EXISTS idx_riesgos_ext_fecha
  ON riesgos_externos_acciones(fecha_ocurrencia DESC);
CREATE INDEX IF NOT EXISTS idx_riesgos_ext_estado
  ON riesgos_externos_acciones(estado);
CREATE INDEX IF NOT EXISTS idx_riesgos_ext_tipo
  ON riesgos_externos_acciones(tipo_riesgo);
CREATE INDEX IF NOT EXISTS idx_riesgos_ext_responsable
  ON riesgos_externos_acciones(responsable_id);


-- =============================================
-- 3) RLS
-- =============================================
ALTER TABLE riesgos_externos_acciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "riesgos_ext_select_auth" ON riesgos_externos_acciones;
CREATE POLICY "riesgos_ext_select_auth"
  ON riesgos_externos_acciones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "riesgos_ext_write_editors" ON riesgos_externos_acciones;
CREATE POLICY "riesgos_ext_write_editors"
  ON riesgos_externos_acciones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
  );


-- =============================================
-- 4) Trigger updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_riesgos_ext_updated_at ON riesgos_externos_acciones;
CREATE TRIGGER trg_riesgos_ext_updated_at
  BEFORE UPDATE ON riesgos_externos_acciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
