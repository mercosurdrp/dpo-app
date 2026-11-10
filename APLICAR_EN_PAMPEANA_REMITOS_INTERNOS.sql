-- Remitos internos: traslados de mercadería y equipos entre depósitos propios
-- (pensado para la mudanza a Presidente Perón, reutilizable después).
--
-- Una "operación" agrupa los viajes (ej. "Mudanza depósito 2026") y numera sus
-- remitos desde 1. Cada remito lleva camión y chofer (de la flota o escritos a
-- mano para fleteros), renglones (artículo de Chess o texto libre) y, en
-- destino, la confirmación de descarga: OK o con novedad, con comentario.
--
-- Aditiva e idempotente: se puede correr más de una vez.
BEGIN;

-- 1. Operaciones
CREATE TABLE IF NOT EXISTS remitos_operaciones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  origen     text,
  destino    text,
  activa     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Remitos
CREATE TABLE IF NOT EXISTS remitos_internos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operacion_id       uuid NOT NULL REFERENCES remitos_operaciones(id) ON DELETE RESTRICT,
  numero             integer NOT NULL,
  fecha              date NOT NULL DEFAULT CURRENT_DATE,
  origen             text,
  destino            text,
  vehiculo_id        uuid REFERENCES catalogo_vehiculos(id) ON DELETE SET NULL,
  patente            text NOT NULL,
  chofer_id          uuid REFERENCES catalogo_choferes(id) ON DELETE SET NULL,
  chofer_nombre      text NOT NULL,
  observaciones      text,
  anulado            boolean NOT NULL DEFAULT false,
  descarga_estado    text CHECK (descarga_estado IN ('ok','con_novedad')),
  descarga_comentario text,
  descargado_por     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  descargado_at      timestamptz,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remitos_internos_numero_uk UNIQUE (operacion_id, numero),
  CONSTRAINT remitos_internos_novedad_con_comentario CHECK (
    descarga_estado IS DISTINCT FROM 'con_novedad' OR coalesce(btrim(descarga_comentario), '') <> ''
  )
);
CREATE INDEX IF NOT EXISTS remitos_internos_op_idx ON remitos_internos(operacion_id, numero DESC);

-- 3. Renglones
CREATE TABLE IF NOT EXISTS remitos_internos_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remito_id   uuid NOT NULL REFERENCES remitos_internos(id) ON DELETE CASCADE,
  orden       integer NOT NULL DEFAULT 0,
  id_articulo integer,               -- null = renglón libre (racks, muebles, equipos)
  descripcion text NOT NULL,
  cantidad    numeric(12,2) NOT NULL CHECK (cantidad > 0),
  unidad      text NOT NULL DEFAULT 'bultos'
);
CREATE INDEX IF NOT EXISTS remitos_internos_items_remito_idx ON remitos_internos_items(remito_id, orden);

-- 4. Número correlativo por operación (desde 1). El lock por operación evita
--    que dos remitos cargados a la vez salgan con el mismo número.
CREATE OR REPLACE FUNCTION remitos_internos_set_numero() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero <= 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('remitos_internos:' || NEW.operacion_id::text));
    SELECT coalesce(max(numero), 0) + 1 INTO NEW.numero
      FROM remitos_internos WHERE operacion_id = NEW.operacion_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_remitos_internos_numero ON remitos_internos;
CREATE TRIGGER trg_remitos_internos_numero BEFORE INSERT ON remitos_internos
  FOR EACH ROW EXECUTE FUNCTION remitos_internos_set_numero();

DROP TRIGGER IF EXISTS trg_remitos_internos_updated_at ON remitos_internos;
CREATE TRIGGER trg_remitos_internos_updated_at BEFORE UPDATE ON remitos_internos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Permisos: todos los logueados ven; admin, supervisor y admin_rrhh cargan y
--    editan. La descarga la confirma cualquier logueado, pero sólo por la RPC
--    de abajo, que toca únicamente los campos de descarga.
CREATE OR REPLACE FUNCTION es_editor_remitos() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh'))
$$;

ALTER TABLE remitos_operaciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos_internos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos_internos_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remitos_operaciones_select" ON remitos_operaciones;
CREATE POLICY "remitos_operaciones_select" ON remitos_operaciones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "remitos_operaciones_write" ON remitos_operaciones;
CREATE POLICY "remitos_operaciones_write" ON remitos_operaciones FOR ALL TO authenticated
  USING (es_editor_remitos()) WITH CHECK (es_editor_remitos());

DROP POLICY IF EXISTS "remitos_internos_select" ON remitos_internos;
CREATE POLICY "remitos_internos_select" ON remitos_internos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "remitos_internos_write" ON remitos_internos;
CREATE POLICY "remitos_internos_write" ON remitos_internos FOR ALL TO authenticated
  USING (es_editor_remitos()) WITH CHECK (es_editor_remitos());

DROP POLICY IF EXISTS "remitos_internos_items_select" ON remitos_internos_items;
CREATE POLICY "remitos_internos_items_select" ON remitos_internos_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "remitos_internos_items_write" ON remitos_internos_items;
CREATE POLICY "remitos_internos_items_write" ON remitos_internos_items FOR ALL TO authenticated
  USING (es_editor_remitos()) WITH CHECK (es_editor_remitos());

GRANT ALL ON remitos_operaciones, remitos_internos, remitos_internos_items TO authenticated, service_role;

-- 6. Confirmar descarga (cualquier logueado). p_estado null = deshacer (sólo editores).
CREATE OR REPLACE FUNCTION remito_interno_marcar_descarga(p_id uuid, p_estado text, p_comentario text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_estado IS NULL THEN
    IF NOT es_editor_remitos() THEN
      RAISE EXCEPTION 'Sólo un supervisor puede deshacer la descarga';
    END IF;
    UPDATE remitos_internos
       SET descarga_estado = NULL, descarga_comentario = NULL, descargado_por = NULL, descargado_at = NULL
     WHERE id = p_id;
    RETURN;
  END IF;
  IF p_estado NOT IN ('ok','con_novedad') THEN
    RAISE EXCEPTION 'Estado de descarga inválido';
  END IF;
  IF p_estado = 'con_novedad' AND coalesce(btrim(p_comentario), '') = '' THEN
    RAISE EXCEPTION 'Con novedad hay que contar qué pasó en el comentario';
  END IF;
  UPDATE remitos_internos
     SET descarga_estado = p_estado,
         descarga_comentario = nullif(btrim(p_comentario), ''),
         descargado_por = auth.uid(),
         descargado_at = now()
   WHERE id = p_id AND NOT anulado;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Remito inexistente o anulado';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION remito_interno_marcar_descarga(uuid, text, text) TO authenticated;

-- 7. Primera operación
INSERT INTO remitos_operaciones (nombre, origen, destino)
SELECT 'Mudanza depósito 2026', 'Depósito actual', 'Depósito Presidente Perón'
WHERE NOT EXISTS (SELECT 1 FROM remitos_operaciones);

COMMIT;
