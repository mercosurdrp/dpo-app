-- =============================================
-- Etapa 3 (Tablero de control) · Observaciones por indicador — 21/10/2026
--
-- Sebastián pidió, para las reuniones de Logística, Warehouse y Matinal
-- Distribución, un lugar debajo del tablero de indicadores donde dejar
-- observaciones cuando un indicador no cumplió o pasó algo, eligiendo a qué
-- indicador corresponde. Después, al hacer clic en el nombre del indicador en
-- el cuadro, se abre un modal con todas las observaciones y acciones que se
-- generaron para ese indicador (en cualquier reunión del mismo tipo).
--
-- Dos piezas:
--   1) reuniones_indicadores_observaciones: la observación en sí, atada a la
--      reunión donde se cargó y al indicador. El indicador se identifica con
--      el mismo id que usa el tablero: el uuid de reuniones_indicadores_config
--      para los de carga manual, o la clave 'auto_*' de las filas calculadas
--      (auto_sho, auto_rechazos_pct, auto_wqi…). Se guarda también el nombre
--      como foto, por si la config se renombra o se borra.
--   2) reuniones_actividades.indicador_id / indicador_nombre: una actividad
--      del Action Log puede nacer del tablero y quedar atada al indicador.
--      Sigue viviendo en la Etapa 2 (seccion NULL) y además aparece en el
--      historial del indicador.
--
-- Idempotente.
-- =============================================

CREATE TABLE IF NOT EXISTS reuniones_indicadores_observaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  -- uuid de reuniones_indicadores_config o clave 'auto_*' de las filas calculadas
  indicador_id text NOT NULL,
  indicador_nombre text NOT NULL,
  texto text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reuniones_indicadores_observaciones_reunion_idx
  ON reuniones_indicadores_observaciones (reunion_id);
CREATE INDEX IF NOT EXISTS reuniones_indicadores_observaciones_indicador_idx
  ON reuniones_indicadores_observaciones (indicador_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_reuniones_indicadores_observaciones_updated_at
  ON reuniones_indicadores_observaciones;
CREATE TRIGGER trg_reuniones_indicadores_observaciones_updated_at
  BEFORE UPDATE ON reuniones_indicadores_observaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reuniones_indicadores_observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reuniones_indicadores_observaciones_read"
  ON reuniones_indicadores_observaciones;
CREATE POLICY "reuniones_indicadores_observaciones_read"
  ON reuniones_indicadores_observaciones
  FOR SELECT TO authenticated USING (true);

-- Escriben los mismos roles que editan reuniones (editores). Los asistentes
-- que cargan valores del tablero no están en este grupo: la observación la
-- deja quien conduce la reunión.
DROP POLICY IF EXISTS "reuniones_indicadores_observaciones_write"
  ON reuniones_indicadores_observaciones;
CREATE POLICY "reuniones_indicadores_observaciones_write"
  ON reuniones_indicadores_observaciones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

COMMENT ON TABLE reuniones_indicadores_observaciones IS
  'Observaciones del Tablero de control (Etapa 3) de las reuniones, atadas a un indicador (uuid de la config o clave auto_*).';

-- Actividad del Action Log nacida del tablero: queda atada al indicador.
ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS indicador_id text,
  ADD COLUMN IF NOT EXISTS indicador_nombre text;

CREATE INDEX IF NOT EXISTS reuniones_actividades_indicador_idx
  ON reuniones_actividades (indicador_id)
  WHERE indicador_id IS NOT NULL;

COMMENT ON COLUMN reuniones_actividades.indicador_id IS
  'Indicador del tablero (Etapa 3) del que nació la actividad: uuid de reuniones_indicadores_config o clave auto_*. NULL = no viene del tablero.';
COMMENT ON COLUMN reuniones_actividades.indicador_nombre IS
  'Nombre del indicador al momento de crear la actividad (foto).';

NOTIFY pgrst, 'reload schema';
