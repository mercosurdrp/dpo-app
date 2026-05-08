-- =============================================================
-- APLICAR EN SUPABASE SQL EDITOR (una sola vez)
-- Proyecto: tpafgmbhnucdiavvxbcg
-- Copiar TODO este archivo y ejecutar en:
--   https://supabase.com/dashboard/project/tpafgmbhnucdiavvxbcg/sql/new
-- =============================================================

-- ==== Migración 033: fotos por ítem + acciones =========

CREATE TYPE s5_accion_estado AS ENUM ('pendiente', 'resuelto');

CREATE TABLE s5_auditoria_item_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_item_id UUID NOT NULL REFERENCES s5_auditoria_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL,
  subido_por UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_s5_item_fotos_item ON s5_auditoria_item_fotos(auditoria_item_id);
CREATE INDEX idx_s5_item_fotos_subido_por ON s5_auditoria_item_fotos(subido_por);

ALTER TABLE s5_auditoria_item_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_item_fotos_read"
  ON s5_auditoria_item_fotos FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_item_fotos_insert"
  ON s5_auditoria_item_fotos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_item_fotos_delete"
  ON s5_auditoria_item_fotos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE TABLE s5_auditoria_acciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id UUID NOT NULL REFERENCES s5_auditorias(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  responsable_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  estado s5_accion_estado NOT NULL DEFAULT 'pendiente',
  notas_resolucion TEXT,
  foto_resolucion_path TEXT,
  resuelto_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fecha_resolucion TIMESTAMPTZ,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_s5_acciones_auditoria ON s5_auditoria_acciones(auditoria_id);
CREATE INDEX idx_s5_acciones_responsable ON s5_auditoria_acciones(responsable_profile_id);
CREATE INDEX idx_s5_acciones_estado ON s5_auditoria_acciones(estado);

CREATE TRIGGER trg_s5_acciones_updated_at
  BEFORE UPDATE ON s5_auditoria_acciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE s5_auditoria_acciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "s5_acciones_read"
  ON s5_auditoria_acciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "s5_acciones_insert"
  ON s5_auditoria_acciones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

CREATE POLICY "s5_acciones_update"
  ON s5_auditoria_acciones FOR UPDATE TO authenticated
  USING (
    responsable_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

CREATE POLICY "s5_acciones_delete"
  ON s5_auditoria_acciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor')));

-- ==== Policies del bucket 's5-auditorias' en storage.objects =========
-- (El bucket ya fue creado vía API)

DROP POLICY IF EXISTS "s5_auditorias_select" ON storage.objects;
CREATE POLICY "s5_auditorias_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 's5-auditorias');

DROP POLICY IF EXISTS "s5_auditorias_insert" ON storage.objects;
CREATE POLICY "s5_auditorias_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 's5-auditorias'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

DROP POLICY IF EXISTS "s5_auditorias_update" ON storage.objects;
CREATE POLICY "s5_auditorias_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 's5-auditorias'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

DROP POLICY IF EXISTS "s5_auditorias_delete" ON storage.objects;
CREATE POLICY "s5_auditorias_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 's5-auditorias'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

-- ==== Migración 035: Plan de Acción tipo Teams =========
-- Responsables múltiples + reprogramaciones + evidencia obligatoria

CREATE TYPE plan_responsable_rol AS ENUM ('responsable_principal', 'coresponsable');

CREATE TABLE plan_responsables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rol plan_responsable_rol NOT NULL DEFAULT 'coresponsable',
  asignado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  asignado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, profile_id)
);

CREATE INDEX idx_plan_responsables_plan ON plan_responsables(plan_id);
CREATE INDEX idx_plan_responsables_profile ON plan_responsables(profile_id);

CREATE UNIQUE INDEX uq_plan_responsable_principal
  ON plan_responsables(plan_id) WHERE rol = 'responsable_principal';

ALTER TABLE plan_responsables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_responsables_read"
  ON plan_responsables FOR SELECT TO authenticated USING (true);

CREATE POLICY "plan_responsables_write_admin"
  ON plan_responsables FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
  );

CREATE TABLE plan_reprogramaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_accion(id) ON DELETE CASCADE,
  fecha_anterior DATE,
  fecha_nueva DATE NOT NULL,
  motivo TEXT,
  reprogramado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reprogramado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_reprogramaciones_plan ON plan_reprogramaciones(plan_id);

ALTER TABLE plan_reprogramaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_reprogramaciones_read"
  ON plan_reprogramaciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "plan_reprogramaciones_insert"
  ON plan_reprogramaciones FOR INSERT TO authenticated
  WITH CHECK (
    reprogramado_por = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','auditor'))
      OR EXISTS (
        SELECT 1 FROM plan_responsables
        WHERE plan_id = plan_reprogramaciones.plan_id AND profile_id = auth.uid()
      )
    )
  );

ALTER TABLE planes_accion
  ADD COLUMN evidencia_obligatoria BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE planes_accion
  ADD COLUMN cerrado_sin_evidencia_motivo TEXT;

CREATE POLICY "planes_accion_responsable_update"
  ON planes_accion FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM plan_responsables
      WHERE plan_id = planes_accion.id AND profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM plan_responsables
      WHERE plan_id = planes_accion.id AND profile_id = auth.uid()
    )
  );

INSERT INTO plan_responsables (plan_id, profile_id, rol, asignado_at)
SELECT DISTINCT
  p.id,
  prof.id,
  'responsable_principal'::plan_responsable_rol,
  p.created_at
FROM planes_accion p
JOIN profiles prof
  ON LOWER(TRIM(prof.nombre)) = LOWER(TRIM(p.responsable))
WHERE p.responsable IS NOT NULL
  AND TRIM(p.responsable) <> ''
ON CONFLICT (plan_id, profile_id) DO NOTHING;
