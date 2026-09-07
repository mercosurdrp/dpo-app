-- ============================================================================
-- Campus de Capacitaciones — biblioteca de material de aprendizaje por pilar
-- ============================================================================
-- Pedido de RRHH (07/09/2026): el material de las capacitaciones vive disperso
-- en Drive, WhatsApp y mails; nadie sabe dónde está el PPT de Seguridad Vial ni
-- el SOP de pre-ruta. El Campus lo centraliza en un solo lugar, ordenado por
-- los 7 pilares DPO, accesible desde el menú de cualquier empleado.
--
-- ⚠️ NO CONFUNDIR con las tablas que ya existen:
--   · `capacitaciones` (007) = un EVENTO dictado: fecha, instructor, lugar,
--     asistencias, nota y examen. Se ve en /capacitaciones y /mis-capacitaciones.
--   · `campus_capacitaciones` (esta) = una CARPETA DE MATERIAL de consulta
--     libre dentro de un pilar. No tiene fecha, ni asistencia, ni examen, ni
--     registro de quién la vio. Es una biblioteca, no un curso.
-- Si alguna vez alguien quiere "unificarlas", que lea esto primero: son dos
-- cosas distintas que casualmente se llaman parecido.
--
-- El módulo arranca VACÍO a propósito: no hay datos semilla, RRHH carga todo.
--
-- El pilar se guarda como slug de texto (mismo criterio que
-- `dpo_archivos.pilar_codigo`) y no como FK a `pilares`, porque los UUID de esa
-- tabla difieren entre Pampeana y Misiones y el slug es lo que va en la URL
-- (/campus/seguridad). Así las 7 secciones se renderizan siempre, incluso con
-- la base vacía.
--
-- Idempotente. Se aplica en AMBOS tenants (Pampeana y Misiones).
-- ============================================================================

BEGIN;

-- ── Capacitación: la carpeta de material dentro de un pilar ─────────────────
CREATE TABLE IF NOT EXISTS campus_capacitaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pilar_codigo  TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  descripcion   TEXT,
  orden         INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campus_cap_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT campus_cap_pilar_chk CHECK (pilar_codigo IN
    ('seguridad','gente','entrega','flota','almacen','gestion','planeamiento'))
);

CREATE INDEX IF NOT EXISTS idx_campus_cap_pilar
  ON campus_capacitaciones(pilar_codigo, orden);

-- ── Material: un archivo subido O un link externo, nunca los dos ────────────
-- `nombre_original` guarda el nombre lindo (con tildes y todo) que ve el
-- usuario; `storage_path` guarda la clave saneada del bucket. Storage rechaza
-- claves con tildes o guion largo con "Invalid key" (incidente del 27/08/2026,
-- commit 4930c99b).
CREATE TABLE IF NOT EXISTS campus_materiales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capacitacion_id  UUID NOT NULL REFERENCES campus_capacitaciones(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  descripcion      TEXT,
  tipo             TEXT NOT NULL DEFAULT 'otro',
  origen           TEXT NOT NULL,
  storage_path     TEXT,
  nombre_original  TEXT,
  mime_type        TEXT,
  bytes            BIGINT,
  url_externa      TEXT,
  orden            INT NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campus_mat_titulo_chk CHECK (btrim(titulo) <> ''),
  CONSTRAINT campus_mat_tipo_chk CHECK (tipo IN ('video','ppt','sop','pdf','flyer','otro')),
  CONSTRAINT campus_mat_origen_chk CHECK (origen IN ('archivo','link')),
  CONSTRAINT campus_mat_fuente_chk CHECK (
    (origen = 'archivo' AND storage_path IS NOT NULL AND url_externa IS NULL)
    OR
    (origen = 'link' AND url_externa IS NOT NULL AND storage_path IS NULL)
  ),
  CONSTRAINT campus_mat_url_chk CHECK (url_externa IS NULL OR url_externa ~* '^https?://')
);

CREATE INDEX IF NOT EXISTS idx_campus_mat_cap
  ON campus_materiales(capacitacion_id, orden);

-- ── updated_at ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_campus_cap_updated_at ON campus_capacitaciones;
CREATE TRIGGER trg_campus_cap_updated_at BEFORE UPDATE ON campus_capacitaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_campus_mat_updated_at ON campus_materiales;
CREATE TRIGGER trg_campus_mat_updated_at BEFORE UPDATE ON campus_materiales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS: lee todo el mundo autenticado, escriben solo RRHH y admin ──────────
ALTER TABLE campus_capacitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_materiales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_cap_select ON campus_capacitaciones;
CREATE POLICY campus_cap_select ON campus_capacitaciones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS campus_cap_write ON campus_capacitaciones;
CREATE POLICY campus_cap_write ON campus_capacitaciones
  FOR ALL TO authenticated
  USING (auth_role() IN ('admin','admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin','admin_rrhh'));

DROP POLICY IF EXISTS campus_mat_select ON campus_materiales;
CREATE POLICY campus_mat_select ON campus_materiales
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS campus_mat_write ON campus_materiales;
CREATE POLICY campus_mat_write ON campus_materiales
  FOR ALL TO authenticated
  USING (auth_role() IN ('admin','admin_rrhh'))
  WITH CHECK (auth_role() IN ('admin','admin_rrhh'));

GRANT ALL ON campus_capacitaciones TO anon, authenticated, service_role;
GRANT ALL ON campus_materiales TO anon, authenticated, service_role;

-- ── Bucket `campus` (PÚBLICO) ───────────────────────────────────────────────
-- Público a propósito, por dos razones técnicas:
--   1. El visor de Office (view.officeapps.live.com) necesita una URL
--      alcanzable desde internet que NO venza; con una signed URL de 10 minutos
--      un PPT "no abre" la segunda vez.
--   2. El <video> necesita HTTP Range con URL estable: si la firma vence en
--      medio de un seek se corta la reproducción (y en iOS ni arranca).
-- Mismo criterio que los buckets `sops` y `portal-comunicaciones`, que ya son
-- públicos. La ruta lleva un UUID aleatorio por archivo, así que no es
-- enumerable. ⚠️ En `campus` NO va material confidencial (sueldos, legajos,
-- datos personales): es material de capacitación.
--
-- ⚠️ El file_size_limit del bucket no puede superar el límite GLOBAL del
-- proyecto (Dashboard → Storage → Settings, por defecto 50 MB). Si RRHH va a
-- subir videos hay que subir ese global a mano en los DOS tenants; si no, el
-- upload falla con "Payload too large" aunque acá diga 200 MB. Para videos
-- largos la recomendación sigue siendo pegar el link de YouTube o Drive.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('campus', 'campus', true, 209715200)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "campus_storage_read" ON storage.objects;
CREATE POLICY "campus_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campus');

DROP POLICY IF EXISTS "campus_storage_insert" ON storage.objects;
CREATE POLICY "campus_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campus'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','admin_rrhh')
    )
  );

DROP POLICY IF EXISTS "campus_storage_delete" ON storage.objects;
CREATE POLICY "campus_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campus'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin','admin_rrhh')
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
