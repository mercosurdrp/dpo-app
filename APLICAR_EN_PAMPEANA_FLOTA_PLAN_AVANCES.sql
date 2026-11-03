-- =============================================
-- Seguimiento de los planes de acción de flota (DPO 2.2 / 4.2)
--
-- El plan tenía causa raíz, acciones y resultado de cierre, pero entre que se
-- abre y se cierra no había dónde contar qué se hizo: el auditor ve el plan
-- abierto hace dos meses y no sabe si alguien lo está atendiendo. Esto agrega
-- el comentario de avance con hasta dos fotos, que es como quedó pedido:
-- "algún comentario y fotos optativas, 1 o 2, así queda completo".
--
-- Mismo patrón que rechazos_planes_avances / nps_planes_avances: los adjuntos
-- van en la jsonb `archivos` y las columnas singulares quedan por
-- compatibilidad con `archivosDeFila()`.
--
-- Las fotos van al bucket `mantenimiento-evidencias`, que ya existe y ya tiene
-- sus policies (migración 130): no se crea bucket nuevo.
-- =============================================

CREATE TABLE IF NOT EXISTS flota_plan_avances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES flota_plan_accion(id) ON DELETE CASCADE,
  -- 🚨 El comentario cuelga de UNA ACCIÓN del plan, no del plan entero: un plan
  -- con cinco acciones tenía un solo renglón de seguimiento para las cinco y no
  -- se sabía a cuál se refería. NULL = comentario general del plan (no lo usa
  -- la pantalla hoy, queda por si hace falta).
  item_id UUID REFERENCES flota_plan_accion_items(id) ON DELETE CASCADE,
  comentario TEXT,
  archivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  archivo_path TEXT,
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_bytes BIGINT,
  autor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un avance vacío no es un avance: o cuenta algo o muestra algo.
  CONSTRAINT flota_plan_avances_payload_chk CHECK (
    coalesce(btrim(comentario), '') <> ''
    OR archivo_path IS NOT NULL
    OR jsonb_array_length(archivos) > 0
  )
);

-- Por si la tabla ya se habia creado con la primera version de este archivo
-- (sin item_id): correrlo de nuevo la completa en vez de fallar.
ALTER TABLE flota_plan_avances
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES flota_plan_accion_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_flota_plan_avances_plan
  ON flota_plan_avances(plan_id);
CREATE INDEX IF NOT EXISTS idx_flota_plan_avances_item
  ON flota_plan_avances(item_id);
CREATE INDEX IF NOT EXISTS idx_flota_plan_avances_created
  ON flota_plan_avances(created_at);

ALTER TABLE flota_plan_avances ENABLE ROW LEVEL SECURITY;

-- Lectura para todos los logueados (el plan ya es visible para todos);
-- escritura admin/supervisor, igual que el resto del módulo de flota.
DROP POLICY IF EXISTS "flota_plan_avances_select" ON flota_plan_avances;
CREATE POLICY "flota_plan_avances_select"
  ON flota_plan_avances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "flota_plan_avances_write" ON flota_plan_avances;
CREATE POLICY "flota_plan_avances_write"
  ON flota_plan_avances FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );
