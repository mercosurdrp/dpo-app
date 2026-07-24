-- =============================================
-- Requisitos Legales · Gestión del trámite de renovación
-- =============================================
-- Entre "se avisó que vence" y "se subió el documento nuevo" no había nada
-- registrado: un SENASA con turno sacado se veía igual de rojo que uno que
-- nadie tocó. Esta migración agrega el trámite en curso (una gestión ABIERTA
-- por requisito) más su bitácora de movimientos, para que el responsable
-- pueda declarar "ya lo solicité" / "tengo turno el 08/08" / "está presentado".
--
-- La gestión se cierra sola cuando se renueva el requisito (se sube el
-- documento nuevo) — ver `renovarRequisito` en src/actions/requisitos-legales.ts.
--
-- Aditiva e idempotente. SOLO PAMPEANA (Misiones no la tiene: la UI oculta
-- la solapa sola cuando las tablas no existen, mismo criterio que la RACI).
-- =============================================

BEGIN;

-- =============================================
-- 1) Gestión (trámite en curso de un requisito)
-- =============================================
CREATE TABLE IF NOT EXISTS requisitos_legales_gestiones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisito_id          uuid NOT NULL REFERENCES requisitos_legales(id) ON DELETE CASCADE,
  estado                text NOT NULL DEFAULT 'solicitado'
                          CHECK (estado IN ('solicitado', 'turno_asignado', 'en_tramite')),
  fecha_turno           date,
  organismo             text,
  nro_tramite           text,
  -- Vencimiento que se estaba renovando cuando se abrió el trámite. Queda
  -- congelado para que el histórico no se pise al correr las fechas.
  vencimiento_objetivo  date NOT NULL,
  abierta               boolean NOT NULL DEFAULT true,
  cierre_motivo         text CHECK (cierre_motivo IN ('renovado', 'cancelada')),
  cerrada_at            timestamptz,
  cerrada_por           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN requisitos_legales_gestiones.estado IS
  'solicitado = se pidió el documento/inició el trámite; turno_asignado = hay turno con fecha; en_tramite = presentado, esperando emisión.';

COMMENT ON COLUMN requisitos_legales_gestiones.abierta IS
  'Solo puede haber UNA gestión abierta por requisito (índice único parcial). Se cierra al renovar.';

-- Una sola gestión abierta por requisito
CREATE UNIQUE INDEX IF NOT EXISTS uniq_req_legales_gestion_abierta
  ON requisitos_legales_gestiones(requisito_id)
  WHERE abierta;

CREATE INDEX IF NOT EXISTS idx_req_legales_gestiones_requisito
  ON requisitos_legales_gestiones(requisito_id);


-- =============================================
-- 2) Bitácora de movimientos
-- =============================================
CREATE TABLE IF NOT EXISTS requisitos_legales_gestion_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestion_id      uuid NOT NULL REFERENCES requisitos_legales_gestiones(id) ON DELETE CASCADE,
  estado          text NOT NULL
                    CHECK (estado IN ('solicitado', 'turno_asignado', 'en_tramite', 'renovado', 'cancelada')),
  fecha_turno     date,
  comentario      text,
  archivo_url     text,
  archivo_nombre  text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE requisitos_legales_gestion_eventos IS
  'Un movimiento por cada vez que el responsable declara avance del trámite. Es la evidencia de gestión para la auditoría DPO 2.1.';

CREATE INDEX IF NOT EXISTS idx_req_legales_gestion_eventos_gestion
  ON requisitos_legales_gestion_eventos(gestion_id, created_at DESC);


-- =============================================
-- 3) Permiso: editores O el responsable del requisito
-- =============================================
-- El responsable asignado es el que recibe el mail de alerta, así que es el
-- que tiene que poder cargar el avance aunque no sea admin/supervisor.
CREATE OR REPLACE FUNCTION public.puede_gestionar_requisito_legal(p_requisito_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'admin_rrhh')
    )
    OR EXISTS (
      SELECT 1 FROM requisitos_legales
      WHERE id = p_requisito_id
        AND responsable_id = auth.uid()
    );
$$;


-- =============================================
-- 4) RLS
-- =============================================
ALTER TABLE requisitos_legales_gestiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitos_legales_gestion_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "req_legales_gestiones_select_auth" ON requisitos_legales_gestiones;
CREATE POLICY "req_legales_gestiones_select_auth"
  ON requisitos_legales_gestiones FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "req_legales_gestiones_write" ON requisitos_legales_gestiones;
CREATE POLICY "req_legales_gestiones_write"
  ON requisitos_legales_gestiones FOR ALL TO authenticated
  USING (public.puede_gestionar_requisito_legal(requisito_id))
  WITH CHECK (public.puede_gestionar_requisito_legal(requisito_id));

DROP POLICY IF EXISTS "req_legales_gestion_eventos_select_auth" ON requisitos_legales_gestion_eventos;
CREATE POLICY "req_legales_gestion_eventos_select_auth"
  ON requisitos_legales_gestion_eventos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "req_legales_gestion_eventos_write" ON requisitos_legales_gestion_eventos;
CREATE POLICY "req_legales_gestion_eventos_write"
  ON requisitos_legales_gestion_eventos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM requisitos_legales_gestiones g
      WHERE g.id = gestion_id
        AND public.puede_gestionar_requisito_legal(g.requisito_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM requisitos_legales_gestiones g
      WHERE g.id = gestion_id
        AND public.puede_gestionar_requisito_legal(g.requisito_id)
    )
  );


-- =============================================
-- 5) Trigger updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_req_legales_gestiones_updated_at ON requisitos_legales_gestiones;
CREATE TRIGGER trg_req_legales_gestiones_updated_at
  BEFORE UPDATE ON requisitos_legales_gestiones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
