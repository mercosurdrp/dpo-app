-- =============================================
-- Contador compartido de la reunión de Logística (Pampeana)
-- =============================================
-- El contador de 30 min dejaba de ser útil como "cierre" porque vivía en el
-- navegador de cada participante (localStorage). Esta tabla lleva el estado a
-- la DB, 1 fila por reunión, para que:
--   - el inicio y la finalización sean compartidos entre todos,
--   - una vez finalizada NADIE pueda volver a iniciarlo,
--   - quede registrado el tiempo final del contador como cierre de la reunión.
--
-- Estados: inactivo → en_curso → finalizada (terminal).
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS reuniones_contador (
  reunion_id          uuid PRIMARY KEY REFERENCES reuniones(id) ON DELETE CASCADE,
  minutos             int  NOT NULL DEFAULT 30,
  estado              text NOT NULL DEFAULT 'inactivo'
                        CHECK (estado IN ('inactivo','en_curso','finalizada')),
  -- Instante en que se inició (o reanudó) el contador.
  inicio_at           timestamptz,
  -- Instante absoluto de fin previsto mientras está en_curso (inicio + minutos).
  -- El restante se recalcula contra el reloj, robusto a pestañas en background.
  fin_previsto_at     timestamptz,
  -- Cierre de la reunión: cuándo se finalizó y cuántos segundos quedaban
  -- en el contador en ese momento (resultado final).
  finalizada_at       timestamptz,
  restante_final_seg  int,
  iniciado_por        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  finalizada_por      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reuniones_contador ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (todos los participantes ven el estado).
DROP POLICY IF EXISTS "reuniones_contador_select_auth" ON reuniones_contador;
CREATE POLICY "reuniones_contador_select_auth"
  ON reuniones_contador FOR SELECT TO authenticated
  USING (true);

-- Escritura: solo editores (admin / supervisor / admin_rrhh), igual que reuniones.
DROP POLICY IF EXISTS "reuniones_contador_write_editors" ON reuniones_contador;
CREATE POLICY "reuniones_contador_write_editors"
  ON reuniones_contador FOR ALL TO authenticated
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

COMMIT;
