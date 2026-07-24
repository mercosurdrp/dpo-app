-- =============================================
-- Movimientos de HELADERAS en la calle (colocación / retiro)
-- El chofer registra desde la app: código de cliente, si LLEVÓ (colocación)
-- o TRAJO (retiro) la heladera, y la foto de la heladera colocada en el
-- cliente o cargada en el camión. Queda registro con autor, fecha y foto.
-- Solo Pampeana. Patrón calcado de roturas_calle (141).
-- =============================================

-- =============================================
-- Enum del tipo de movimiento
-- =============================================
CREATE TYPE heladera_tipo_mov AS ENUM (
  'colocacion',  -- la llevó y la dejó en el cliente
  'retiro'       -- la levantó del cliente y la trajo en el camión
);

-- =============================================
-- Cabecera del movimiento
-- =============================================
CREATE TABLE heladeras_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  hora TIME,
  tipo heladera_tipo_mov NOT NULL,
  id_cliente INTEGER NOT NULL,
  nombre_cliente TEXT,
  localidad TEXT,
  -- Número de activo / serie de la heladera (la súper-llave del EDF). Opcional:
  -- muchas veces el chofer no llega a leer la chapa.
  cod_activo TEXT,
  -- Descripción libre del equipo (marca, modelo, puertas).
  descripcion TEXT,
  patente TEXT,
  chofer_nombre TEXT,
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'registrado',  -- registrado / validado / observado
  comentario_gestion TEXT,
  revisado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revisado_at TIMESTAMPTZ,
  creado_por UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heladeras_mov_fecha ON heladeras_movimientos(fecha DESC);
CREATE INDEX idx_heladeras_mov_cliente ON heladeras_movimientos(id_cliente);
CREATE INDEX idx_heladeras_mov_creado_por ON heladeras_movimientos(creado_por);
CREATE INDEX idx_heladeras_mov_created_at ON heladeras_movimientos(created_at DESC);

CREATE TRIGGER trg_heladeras_movimientos_updated_at
  BEFORE UPDATE ON heladeras_movimientos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Adjuntos (fotos de la heladera colocada / cargada en el camión)
-- =============================================
CREATE TABLE heladeras_movimientos_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id UUID NOT NULL REFERENCES heladeras_movimientos(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamaño_bytes BIGINT,
  creado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heladeras_mov_adjuntos_mov ON heladeras_movimientos_adjuntos(movimiento_id);

-- =============================================
-- Storage bucket (público, igual que roturas-calle: se sirve con getPublicUrl)
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('heladeras', 'heladeras', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "heladeras_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'heladeras');

CREATE POLICY "heladeras_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'heladeras');

CREATE POLICY "heladeras_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'heladeras');

CREATE POLICY "heladeras_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'heladeras'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- RLS
-- =============================================
ALTER TABLE heladeras_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE heladeras_movimientos_adjuntos ENABLE ROW LEVEL SECURITY;

-- Cabecera: lectura interna a todos; cada uno crea los suyos;
-- update por el autor o admin/supervisor (revisión); delete admin.
CREATE POLICY "heladeras_movimientos_read"
  ON heladeras_movimientos FOR SELECT TO authenticated USING (true);

CREATE POLICY "heladeras_movimientos_insert"
  ON heladeras_movimientos FOR INSERT TO authenticated
  WITH CHECK (creado_por = auth.uid());

CREATE POLICY "heladeras_movimientos_update"
  ON heladeras_movimientos FOR UPDATE TO authenticated
  USING (
    creado_por = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
  );

CREATE POLICY "heladeras_movimientos_delete"
  ON heladeras_movimientos FOR DELETE TO authenticated
  USING (
    creado_por = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Adjuntos: lectura interna; insert por el dueño del movimiento o admin;
-- delete por el dueño o admin (borrar el movimiento arrastra sus fotos).
CREATE POLICY "heladeras_mov_adjuntos_read"
  ON heladeras_movimientos_adjuntos FOR SELECT TO authenticated USING (true);

CREATE POLICY "heladeras_mov_adjuntos_insert"
  ON heladeras_movimientos_adjuntos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM heladeras_movimientos m
      WHERE m.id = heladeras_movimientos_adjuntos.movimiento_id
        AND m.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "heladeras_mov_adjuntos_delete"
  ON heladeras_movimientos_adjuntos FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM heladeras_movimientos m
      WHERE m.id = heladeras_movimientos_adjuntos.movimiento_id
        AND m.creado_por = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
