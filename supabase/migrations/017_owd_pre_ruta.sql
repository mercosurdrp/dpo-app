-- =============================================
-- OWD Pre-Ruta: Observación en el Puesto de Trabajo
-- Pilar Entrega 1.1 — R1.1.2 "proceso ejecutado según SOP"
-- =============================================

CREATE TYPE owd_resultado AS ENUM ('ok', 'nook', 'na');

-- Catálogo de ítems del checklist OWD (versionable)
CREATE TABLE owd_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL DEFAULT 1,
  etapa TEXT NOT NULL,           -- "Ingreso al CD", "Reunión matinal", etc.
  orden INTEGER NOT NULL,
  texto TEXT NOT NULL,           -- qué observar
  descripcion TEXT,              -- ayuda al supervisor
  critico BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owd_items_version ON owd_items(version);
CREATE INDEX idx_owd_items_etapa ON owd_items(etapa);

-- Observación (cabecera)
CREATE TABLE owd_observaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  supervisor TEXT NOT NULL,          -- nombre del SDR
  empleado_observado TEXT NOT NULL,  -- chofer o ayudante
  rol_empleado TEXT,                 -- "Chofer" / "Ayudante"
  dominio TEXT,                      -- patente si aplica
  template_version INTEGER NOT NULL DEFAULT 1,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_ok INTEGER NOT NULL DEFAULT 0,
  total_nook INTEGER NOT NULL DEFAULT 0,
  total_na INTEGER NOT NULL DEFAULT 0,
  pct_cumplimiento NUMERIC(5,2) NOT NULL DEFAULT 0,
  accion_correctiva TEXT,
  observaciones TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_owd_obs_fecha ON owd_observaciones(fecha);
CREATE INDEX idx_owd_obs_supervisor ON owd_observaciones(supervisor);
CREATE INDEX idx_owd_obs_empleado ON owd_observaciones(empleado_observado);

-- Respuestas individuales
CREATE TABLE owd_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observacion_id UUID NOT NULL REFERENCES owd_observaciones(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES owd_items(id),
  resultado owd_resultado NOT NULL,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (observacion_id, item_id)
);

CREATE INDEX idx_owd_resp_obs ON owd_respuestas(observacion_id);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE owd_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE owd_observaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE owd_respuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owd_items_read" ON owd_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "owd_items_admin" ON owd_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "owd_obs_read" ON owd_observaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "owd_obs_insert" ON owd_observaciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "owd_obs_update" ON owd_observaciones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "owd_obs_delete" ON owd_observaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "owd_resp_read" ON owd_respuestas FOR SELECT TO authenticated USING (true);
CREATE POLICY "owd_resp_insert" ON owd_respuestas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "owd_resp_update" ON owd_respuestas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "owd_resp_delete" ON owd_respuestas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================
-- SEED: Template v1 — SOP 1.1 Pre-Ruta
-- =============================================
INSERT INTO owd_items (version, etapa, orden, texto, descripcion, critico) VALUES
-- 1. Ingreso al CD
(1, 'Ingreso al CD', 1, 'Ingresa al CD antes de las 07:00', 'Registrado en lector biométrico', true),
(1, 'Ingreso al CD', 2, 'Cuenta con EPPs completos', 'Botines, ropa refractaria, guantes, faja lumbar, protector ocular', true),
-- 2. Entrega de documentación
(1, 'Entrega de documentación', 3, 'SDR entregó documentación de reparto', 'Planilla de carga, composición, facturas, NC y comodatos', true),
(1, 'Entrega de documentación', 4, 'Documentación completa (gestionó faltantes en admin si hizo falta)', NULL, false),
-- 3. Reunión matinal
(1, 'Reunión matinal', 5, 'Registra asistencia en biométrico antes de iniciar la reunión', NULL, true),
(1, 'Reunión matinal', 6, 'La reunión inicia en horario y finaliza ≤ 07:12', 'Duración máxima 12 minutos', true),
(1, 'Reunión matinal', 7, 'Se tratan los temas del SOP', 'Seguridad, KPIs, flota, novedades de ruta, calidad, capacitación', false),
(1, 'Reunión matinal', 8, 'SDR verifica disponibilidad de EPPs verbalmente', NULL, false),
(1, 'Reunión matinal', 9, 'SDR cierra con mensaje de motivación', NULL, false),
-- 4. Inicio de ruta en Foxtrot
(1, 'Inicio de ruta Foxtrot', 10, 'Chofer marca inicio de ruta en Foxtrot antes de salir a nave', NULL, true),
-- 5. Verificación de carga
(1, 'Verificación de carga', 11, 'Verifica productos, calibres, calidad y cantidad contra planilla', NULL, true),
(1, 'Verificación de carga', 12, 'Disposición y seguridad de la carga OK', 'Pallets alineados, asegurados con film/cartón según corresponda', true),
(1, 'Verificación de carga', 13, 'Solo el chofer ingresa a nave 2', 'Ayudantes esperan en pasillo peatonal', true),
-- 6. Checklist de liberación (CloudFleet)
(1, 'Checklist de liberación', 14, 'Checklist creado en CloudFleet con camión y odómetro correctos', NULL, true),
(1, 'Checklist de liberación', 15, 'Todos los ítems respondidos', 'EPPs, botiquín, docs, cinturón, extintor, luces, frenos, etc.', true),
(1, 'Checklist de liberación', 16, 'Puntos críticos OK', 'Si hubo NO OK, se avisó al SDR', true),
(1, 'Checklist de liberación', 17, 'Checklist finaliza en estado aprobado', NULL, true),
(1, 'Checklist de liberación', 18, 'Llaves en lugar correspondiente', 'Oficina depósito / nave 1', false),
(1, 'Checklist de liberación', 19, 'Avisa a seguridad en garita con ruta iniciada y checklist OK', NULL, true),
(1, 'Checklist de liberación', 20, 'Sale del CD antes de las 07:30', 'Objetivo de inicio de ruta', true);
