-- =============================================
-- Novedades: cartelera de avisos de la empresa para TODOS los empleados
-- (cumpleaños del mes, feriados, comunicados). Se ve arriba de todo en el
-- Inicio del portal del empleado.
--
-- «Comunicaciones» NO sirve para esto: desde la 102 es un buzón ascendente
-- (el empleado escribe, el admin gestiona) y cada empleado ve sólo lo suyo.
--
-- Escritura: sólo desde el servidor con service role, después de chequear el
-- rol (admin/supervisor) en la server action. Lectura: cualquier usuario
-- logueado. Idempotente. Aplicar en Pampeana (y en Misiones si se usa).
-- =============================================

CREATE TABLE IF NOT EXISTS novedades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  texto TEXT,
  imagen_path TEXT,
  -- Último día que se muestra (inclusive). NULL = hasta que se borre.
  vigente_hasta DATE,
  fijada BOOLEAN NOT NULL DEFAULT false,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_novedades_vigencia ON novedades(vigente_hasta);

ALTER TABLE novedades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "novedades_select_autenticados" ON novedades;
CREATE POLICY "novedades_select_autenticados" ON novedades
  FOR SELECT TO authenticated USING (true);

-- Bucket público de imágenes (las URLs se muestran directo en <img>).
INSERT INTO storage.buckets (id, name, public)
VALUES ('novedades', 'novedades', true)
ON CONFLICT (id) DO UPDATE SET public = true;
