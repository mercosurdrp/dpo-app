-- =============================================
-- 088 · SLA (Acuerdos de Nivel de Servicio) exigidos por el manual DPO.
-- Repositorio de los 15 SLA del manual + acuerdos firmados (adjuntos).
-- Gestión (insert/update/delete) reservada a admin y supervisor.
-- Solo Pampeana (la sidebar lo gatea con pampeanaOnly), pero la migración
-- es idempotente y segura de correr en cualquier tenant.
-- =============================================

BEGIN;

-- =============================================
-- Enums
-- =============================================
DO $$ BEGIN
  CREATE TYPE sla_pilar AS ENUM (
    'planeamiento',
    'almacen',
    'entrega',
    'flota',
    'gestion'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sla_estado AS ENUM (
    'pendiente',
    'firmado',
    'no_aplica'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================
-- Tabla principal
-- =============================================
CREATE TABLE IF NOT EXISTS slas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  pilar sla_pilar NOT NULL,
  parte_cliente TEXT,
  parte_proveedor TEXT,
  requisito_manual TEXT,
  descripcion TEXT,
  estado sla_estado NOT NULL DEFAULT 'pendiente',
  fecha_firma DATE,
  fecha_vencimiento DATE,
  es_predefinido BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slas_pilar ON slas(pilar);
CREATE INDEX IF NOT EXISTS idx_slas_orden ON slas(orden);

-- =============================================
-- Adjuntos (el acuerdo firmado: PDF / imagen)
-- =============================================
CREATE TABLE IF NOT EXISTS sla_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id UUID NOT NULL REFERENCES slas(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  nombre_original TEXT,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT NOT NULL,
  subido_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_adjuntos_sla ON sla_adjuntos(sla_id);

-- =============================================
-- Storage bucket (público, igual approach que reportes-seguridad)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('sla', 'sla', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sla_storage_read" ON storage.objects;
CREATE POLICY "sla_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sla');

DROP POLICY IF EXISTS "sla_storage_insert" ON storage.objects;
CREATE POLICY "sla_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sla'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

DROP POLICY IF EXISTS "sla_storage_delete" ON storage.objects;
CREATE POLICY "sla_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'sla'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- =============================================
-- Trigger updated_at
-- =============================================
DROP TRIGGER IF EXISTS trg_slas_updated_at ON slas;
CREATE TRIGGER trg_slas_updated_at
  BEFORE UPDATE ON slas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE slas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_adjuntos ENABLE ROW LEVEL SECURITY;

-- SLAs: lectura para cualquier autenticado; escritura solo admin/supervisor.
DROP POLICY IF EXISTS "slas_read" ON slas;
CREATE POLICY "slas_read"
  ON slas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "slas_insert" ON slas;
CREATE POLICY "slas_insert"
  ON slas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

DROP POLICY IF EXISTS "slas_update" ON slas;
CREATE POLICY "slas_update"
  ON slas FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

DROP POLICY IF EXISTS "slas_delete" ON slas;
CREATE POLICY "slas_delete"
  ON slas FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

-- Adjuntos: lectura para cualquier autenticado; escritura solo admin/supervisor.
DROP POLICY IF EXISTS "sla_adjuntos_read" ON sla_adjuntos;
CREATE POLICY "sla_adjuntos_read"
  ON sla_adjuntos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sla_adjuntos_insert" ON sla_adjuntos;
CREATE POLICY "sla_adjuntos_insert"
  ON sla_adjuntos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

DROP POLICY IF EXISTS "sla_adjuntos_delete" ON sla_adjuntos;
CREATE POLICY "sla_adjuntos_delete"
  ON sla_adjuntos FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ));

-- =============================================
-- Seed: los 15 SLA que exige el manual DPO (es_predefinido = true).
-- Idempotente por `codigo`. No pisa estado/fechas si ya existen.
-- =============================================
INSERT INTO slas (codigo, nombre, pilar, parte_cliente, parte_proveedor, requisito_manual, descripcion, es_predefinido, orden)
VALUES
  ('plan_syop', 'SLA Ventas ↔ Operaciones', 'planeamiento', 'Ventas', 'Operaciones', 'R3.1.3',
   'SLA alineados entre los equipos de ventas y operaciones, monitoreados con frecuencia definida y usados para cerrar brechas cuando un KPI está en rojo.', true, 1),
  ('plan_ruteo_tiempo', 'SLA de tiempo de finalización de ruteo', 'planeamiento', 'Ruteo', 'Operaciones', 'R3.3.3',
   'Acuerdo sobre el horario/tiempo límite de finalización del proceso de ruteo diario.', true, 2),
  ('plan_ruteo_capacidad', 'SLA de cumplimiento de capacidad del camión', 'planeamiento', 'Ruteo', 'Entrega', 'R3.3.3',
   'Acuerdo sobre el nivel de aprovechamiento/cumplimiento de la capacidad de cada camión al rutear.', true, 3),
  ('plan_ruteo_pushed', 'SLA / procedimiento para volumen no ruteado (Pushed Volume)', 'planeamiento', 'Ruteo', 'Ventas', 'R3.3.3',
   'Procedimiento acordado para tratar el volumen que no entra en ruta (pushed volume).', true, 4),
  ('plan_datos_maestros', 'SLA de actualización de datos maestros (RACI de ruteo)', 'planeamiento', 'Datos maestros', 'Ruteo', 'R3.3.3',
   'Frecuencia de actualización de los datos maestros y propiedad definida en la RACI de ruteo.', true, 5),
  ('alm_carga', 'SLA de carga (reducir problemas/retrasos)', 'almacen', 'Almacén', 'Entrega', 'R5.2.1',
   'Acuerdo con el equipo de entrega para reducir problemas o retrasos en el proceso de carga.', true, 6),
  ('alm_recepcion', 'SLA de recepción con T1/BSC', 'almacen', 'Almacén', 'T1 / BSC (abastecimiento)', 'R6.2.1',
   'SLA de ventana horaria de llegada de camiones y precisión del producto, definido y seguido con T1/BSC.', true, 7),
  ('alm_mano_obra', 'SLA para compartir mano de obra', 'almacen', 'Almacén', 'Entrega', 'R7.3.x',
   'Acuerdo con el equipo de entrega para compartir mano de obra.', true, 8),
  ('ent_rmd', 'SLA de cierre de RMD / quejas de clientes', 'entrega', 'Entrega', 'Cliente', 'R4.1.5',
   'Tiempo promedio desde la recolección de RMD o quejas de clientes hasta su cierre, dentro de SLA.', true, 9),
  ('ent_feedback', 'SLA de tratamiento de feedback/motivos del chofer', 'entrega', 'Gestión', 'Equipos de entrega', 'R2.2.3',
   'SLA estándar para tratar los motivos del feedback de los equipos de entrega (excepto seguridad, que vuelve en la siguiente entrega).', true, 10),
  ('flo_checklist', 'SLA de tiempo de reparación de defectos del checklist', 'flota', 'Flota', 'Operaciones', 'R1.3.7',
   'Tiempo de respuesta/reparación de los defectos detectados en los checklists, especialmente los críticos.', true, 11),
  ('flo_reunion', 'SLAs de flota seguidos en la reunión semanal', 'flota', 'Flota', 'Almacén / Entrega / terceros', 'R3.1.4 / R3.1.5',
   'SLAs definidos del pilar de flota, seguidos durante la reunión semanal con planes de acción ante incumplimiento.', true, 12),
  ('flo_repuestos', 'ANS/SLA con proveedores de repuestos', 'flota', 'Flota', 'Proveedor de repuestos', 'R2.3.x',
   'Política de repuestos del tercero y puntualidad de llegada de las piezas (cuando no hay taller interno).', true, 13),
  ('ges_proveedores', 'SLAs con proveedores en la Descripción de Negocio (SIPOC)', 'gestion', 'Operación', 'Proveedores', 'R2.1.3',
   'SLAs definidos con los proveedores en la Descripción de Negocio, con propiedad clara cliente-proveedor y seguimiento de incumplimientos.', true, 14),
  ('ges_instalaciones', 'SLA de mantenimiento de instalaciones', 'gestion', 'Centro de Distribución', 'Proveedor de facilities', 'R2.4.x',
   'Tiempo de respuesta acordado con los proveedores de mantenimiento de instalaciones (dentro de la RACI).', true, 15)
ON CONFLICT (codigo) DO NOTHING;

COMMIT;

-- Reload PostgREST schema cache (fuera de la transacción)
NOTIFY pgrst, 'reload schema';
