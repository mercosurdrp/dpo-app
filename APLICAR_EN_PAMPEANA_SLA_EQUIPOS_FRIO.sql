-- =============================================================
-- SLA Ventas <-> Logistica · entrega y retiro de EQUIPOS DE FRIO
--
-- APLICAR EN: Supabase PAMPEANA — proyecto `dpo` (ref tpafgmbhnucdiavvxbcg)
-- NO aplicar en Misiones (`dpo-distribucions`): este SLA es sólo de Pampeana.
--
-- Regla: los equipos de frío (heladeras, choperas, equipos eléctricos) se
-- entregan (COPOP) o se levantan (CTRCO) SOLO lunes, martes y miércoles cuando
-- el movimiento sale DENTRO DE LA CARGA DE UN CAMION. Excepción: autorización
-- conjunta del Jefe de Logística y el Jefe de Ventas, registrada a posteriori.
--
-- Fuera de alcance (cualquier día, no entra al denominador): el cliente que
-- retira en depósito y el documento emitido fuera de una carga. Se distingue
-- por el campo `Reparto` de Chess: es una PATENTE sólo si salió en camión.
--
-- 🚨 SIN BEGIN/COMMIT a propósito: el SQL Editor de Supabase ya envuelve todo
-- en una transacción, y un BEGIN explícito puede terminar en rollback
-- silencioso. Todo el DDL es idempotente: se puede correr más de una vez.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · Alta del SLA en el repositorio de acuerdos
-- -------------------------------------------------------------
INSERT INTO slas (codigo, nombre, pilar, parte_cliente, parte_proveedor, requisito_manual, descripcion, es_predefinido, orden)
VALUES (
  'plan_equipos_frio',
  'SLA de entrega y retiro de equipos de frío',
  'planeamiento',
  'Ventas',
  'Logística',
  'R3.1.3',
  'Acuerdo entre Ventas y Logística: los equipos de frío que salen dentro de la carga de un camión se entregan (COPOP) o se retiran (CTRCO) únicamente los días lunes, martes y miércoles. Cualquier movimiento fuera de esa ventana requiere autorización conjunta del Jefe de Logística y el Jefe de Ventas, que se registra en la plataforma. Quedan excluidos los retiros en depósito y los documentos emitidos fuera de una carga, posibles cualquier día de la semana.',
  false,
  16
)
ON CONFLICT (codigo) DO NOTHING;

-- -------------------------------------------------------------
-- 2 · Movimientos de equipos de frío sincronizados desde Chess
--     Una fila por LINEA de pedido COPOP/CTRCO con un equipo de frío.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edf_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pedido TEXT NOT NULL,
  id_linea INTEGER NOT NULL,
  fecha_entrega DATE NOT NULL,
  -- COPOP = entrega del equipo · CTRCO = retiro (contracomodato)
  tipo_doc TEXT NOT NULL CHECK (tipo_doc IN ('COPOP', 'CTRCO')),
  -- Campo `Reparto` de Chess tal cual viene (patente o canal)
  reparto TEXT,
  -- true = `Reparto` es una patente => salió en la carga de un camión => aplica el SLA
  en_camion BOOLEAN NOT NULL DEFAULT false,
  id_cliente INTEGER,
  id_articulo INTEGER NOT NULL,
  des_articulo TEXT,
  cantidad NUMERIC NOT NULL DEFAULT 0,
  -- Día de la semana calculado en Postgres (0=domingo .. 6=sábado)
  dow SMALLINT GENERATED ALWAYS AS (EXTRACT(DOW FROM fecha_entrega)::SMALLINT) STORED,
  -- true si cae lunes(1), martes(2) o miércoles(3)
  en_ventana BOOLEAN GENERATED ALWAYS AS (
    EXTRACT(DOW FROM fecha_entrega)::SMALLINT BETWEEN 1 AND 3
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT edf_movimientos_pedido_linea_uk UNIQUE (id_pedido, id_linea)
);

CREATE INDEX IF NOT EXISTS idx_edf_mov_fecha ON edf_movimientos(fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_edf_mov_camion_fecha ON edf_movimientos(en_camion, fecha_entrega);

-- -------------------------------------------------------------
-- 3 · Excepciones autorizadas (registro a posteriori)
--     Una excepción por movimiento. Exige AMBAS autorizaciones.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edf_excepciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL UNIQUE REFERENCES edf_movimientos(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL CHECK (motivo IN (
    'cliente_nuevo_urgente',
    'equipo_roto_sin_frio',
    'recambio_garantia',
    'requerimiento_marca',
    'reprogramacion_cliente',
    'otro'
  )),
  detalle TEXT,
  -- Nombre de los dos jefes que autorizaron en conjunto (ambos obligatorios)
  autoriza_jdl TEXT NOT NULL,
  autoriza_jdv TEXT NOT NULL,
  registrado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edf_exc_movimiento ON edf_excepciones(movimiento_id);

-- -------------------------------------------------------------
-- 4 · Trigger updated_at
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_edf_movimientos_updated_at ON edf_movimientos;
CREATE TRIGGER trg_edf_movimientos_updated_at
  BEFORE UPDATE ON edf_movimientos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------------
-- 5 · RLS — lectura para autenticados; escritura sólo admin/supervisor.
--     Los movimientos los escribe el sync con service role (bypassea RLS).
-- -------------------------------------------------------------
ALTER TABLE edf_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE edf_excepciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edf_movimientos_read" ON edf_movimientos;
CREATE POLICY "edf_movimientos_read"
  ON edf_movimientos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "edf_excepciones_read" ON edf_excepciones;
CREATE POLICY "edf_excepciones_read"
  ON edf_excepciones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "edf_excepciones_insert" ON edf_excepciones;
CREATE POLICY "edf_excepciones_insert"
  ON edf_excepciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

DROP POLICY IF EXISTS "edf_excepciones_update" ON edf_excepciones;
CREATE POLICY "edf_excepciones_update"
  ON edf_excepciones FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

DROP POLICY IF EXISTS "edf_excepciones_delete" ON edf_excepciones;
CREATE POLICY "edf_excepciones_delete"
  ON edf_excepciones FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

-- -------------------------------------------------------------
-- 6 · Verificación — tiene que devolver: 1 | 0 | 0
-- -------------------------------------------------------------
SELECT
  (SELECT count(*) FROM slas WHERE codigo = 'plan_equipos_frio') AS sla_dado_de_alta,
  (SELECT count(*) FROM edf_movimientos) AS movimientos,
  (SELECT count(*) FROM edf_excepciones) AS excepciones;
