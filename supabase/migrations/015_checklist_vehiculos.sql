-- =============================================
-- Checklist de Vehículos (Liberación y Retorno)
-- Para cálculo de Tiempo en Ruta (puerta a puerta)
-- =============================================

-- Tipo de checklist
CREATE TYPE tipo_checklist AS ENUM ('liberacion', 'retorno');

-- Resultado del checklist
CREATE TYPE resultado_checklist AS ENUM ('aprobado', 'rechazado');

-- Tipo de respuesta de cada ítem
CREATE TYPE tipo_respuesta_checklist AS ENUM ('ok_nook', 'bueno_regular_malo', 'ok_regular_nook');

-- =============================================
-- Catálogo de ítems del checklist (las 30 preguntas)
-- =============================================
CREATE TABLE checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL, -- CARROCERÍA, MOTOR, FRENOS, LUCES, NEUMÁTICOS, SEGURIDAD
  nombre TEXT NOT NULL,
  descripcion TEXT,
  critico BOOLEAN NOT NULL DEFAULT false,
  tipo_respuesta tipo_respuesta_checklist NOT NULL DEFAULT 'ok_nook',
  orden INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- Checklist completado (cabecera)
-- =============================================
CREATE TABLE checklist_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_checklist NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  dominio TEXT NOT NULL,
  chofer TEXT NOT NULL,
  hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  resultado resultado_checklist NOT NULL DEFAULT 'aprobado',
  observaciones TEXT,
  -- Tiempo en ruta: solo se calcula en retorno
  tiempo_ruta_minutos INTEGER,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chk_veh_fecha ON checklist_vehiculos(fecha);
CREATE INDEX idx_chk_veh_tipo ON checklist_vehiculos(tipo);
CREATE INDEX idx_chk_veh_dominio ON checklist_vehiculos(dominio);
CREATE INDEX idx_chk_veh_chofer ON checklist_vehiculos(chofer);

-- =============================================
-- Respuestas individuales del checklist
-- =============================================
CREATE TABLE checklist_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklist_vehiculos(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES checklist_items(id),
  valor TEXT NOT NULL, -- 'ok', 'nook', 'bueno', 'regular', 'malo'
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (checklist_id, item_id)
);

CREATE INDEX idx_chk_resp_checklist ON checklist_respuestas(checklist_id);

-- =============================================
-- RLS
-- =============================================
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_respuestas ENABLE ROW LEVEL SECURITY;

-- checklist_items: todos leen, admin gestiona
CREATE POLICY "Authenticated can read checklist_items"
  ON checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage checklist_items"
  ON checklist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- checklist_vehiculos: todos leen e insertan, admin edita/borra
CREATE POLICY "Authenticated can read checklist_vehiculos"
  ON checklist_vehiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert checklist_vehiculos"
  ON checklist_vehiculos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update checklist_vehiculos"
  ON checklist_vehiculos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can delete checklist_vehiculos"
  ON checklist_vehiculos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- checklist_respuestas: todos leen e insertan, admin edita/borra
CREATE POLICY "Authenticated can read checklist_respuestas"
  ON checklist_respuestas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert checklist_respuestas"
  ON checklist_respuestas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update checklist_respuestas"
  ON checklist_respuestas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin can delete checklist_respuestas"
  ON checklist_respuestas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- =============================================
-- SEED: Los 30 ítems del checklist
-- =============================================
INSERT INTO checklist_items (categoria, nombre, descripcion, critico, tipo_respuesta, orden) VALUES
-- CARROCERÍA (1-7)
('CARROCERÍA', 'Estado de manijas, barandas, estribos y soldaduras', NULL, false, 'ok_nook', 1),
('CARROCERÍA', 'Estado de las 5S del camión', 'El camión cumple con las 5S?', false, 'ok_nook', 2),
('CARROCERÍA', 'Cierre de lonas', 'OK= Sistema de cierre de lonas funciona sin dificultad. NO OK= No funciona o funciona con mucha dificultad', false, 'ok_nook', 3),
('CARROCERÍA', 'Estado de lonas general', 'OK= Estado bueno o sin roturas que comprometan la carga. NO OK= Estado malo o con roturas que comprometen la carga', false, 'ok_nook', 4),
('CARROCERÍA', 'Estado de carrocería', 'Choques, rayones o daños visibles', false, 'bueno_regular_malo', 5),
('CARROCERÍA', 'Estribos en buen estado', NULL, false, 'ok_nook', 6),
('CARROCERÍA', 'Funcionamiento de bocina y alarma de retroceso', NULL, false, 'ok_nook', 7),
-- MOTOR (8-10)
('MOTOR', 'Pérdida de fluidos y/o alarmas', 'OK= No hay pérdida. REGULAR= Leve presencia de fluidos. NO OK= Pérdida abundante, la unidad no se puede usar', true, 'ok_regular_nook', 8),
('MOTOR', 'Nivel de aceite motor', NULL, false, 'ok_nook', 9),
('MOTOR', 'Nivel de agua', NULL, false, 'ok_nook', 10),
-- FRENOS (11)
('FRENOS', 'Frenos y suspensión', 'OK= Sin daños que comprometan el funcionamiento durante el día. NO OK= Estado malo o que comprometa el funcionamiento', true, 'ok_nook', 11),
-- LUCES (12-15)
('LUCES', 'Luces bajas y altas', 'OK= Sin daños que comprometan el funcionamiento. NO OK= Estado malo o que comprometa el funcionamiento', true, 'ok_nook', 12),
('LUCES', 'Luces de frenos', 'OK= Sin daños que comprometan el funcionamiento. NO OK= Estado malo o que comprometa el funcionamiento', true, 'ok_nook', 13),
('LUCES', 'Luces de giro y balizas delanteras y traseras', 'OK= Sin daños que comprometan el funcionamiento. NO OK= Estado malo o que comprometa el funcionamiento', true, 'ok_nook', 14),
('LUCES', 'Luces de posición delanteras y traseras', 'OK= Sin daños que comprometan el funcionamiento. NO OK= Estado malo o que comprometa el funcionamiento', true, 'ok_nook', 15),
-- NEUMÁTICOS (16-18)
('NEUMÁTICOS', 'Inspección visual de cubiertas (delanteras)', 'OK= Buena calibración y sin anomalías visibles y/o defecto de forma', false, 'ok_nook', 16),
('NEUMÁTICOS', 'Inspección visual de cubiertas (traseras)', 'OK= Buena calibración y sin anomalías visibles y/o defecto de forma', false, 'ok_nook', 17),
('NEUMÁTICOS', 'Estado del neumático (desgaste)', NULL, false, 'bueno_regular_malo', 18),
-- SEGURIDAD (19-30)
('SEGURIDAD', 'Condiciones climáticas permiten circulación segura', 'Indique el estado del clima (lluvia, niebla, viento fuerte, tormenta, cielo despejado, etc.)', false, 'ok_nook', 19),
('SEGURIDAD', 'Botiquín completo y en buen estado', 'Si debió utilizarlo, recuerde dar aviso', true, 'ok_nook', 20),
('SEGURIDAD', 'EPPs en buenas condiciones', 'Posee zapatos de seguridad, lentes de seguridad, guantes, ropa reflectiva y faja lumbar?', true, 'ok_nook', 21),
('SEGURIDAD', 'Documentación completa', 'Licencia de conducir, cédula verde, seguro, RTO, libreta sanitaria', true, 'ok_nook', 22),
('SEGURIDAD', 'Estado del matafuegos', 'Verificar presión y vencimiento', true, 'ok_nook', 23),
('SEGURIDAD', 'Cinturón de seguridad funciona correctamente', 'Incluye el estado del cinturón de seguridad, si existe rotura o complicación en su funcionamiento', true, 'ok_nook', 24),
('SEGURIDAD', 'Bocina y sirena de retroceso', 'OK= Sin daños que comprometan el funcionamiento. NO OK= Estado malo o que comprometa el funcionamiento', false, 'ok_nook', 25),
('SEGURIDAD', 'Equipo de manipulación (carrito)', 'OK= El equipo (carrito) está presente y en buen estado. NO OK= El equipo no está o está en mal estado', false, 'ok_nook', 26),
('SEGURIDAD', 'Cristales y espejos retrovisores', 'OK= Espejos presentes y en buen estado. NO OK= Espejos no están o en mal estado', false, 'ok_nook', 27),
('SEGURIDAD', 'Tacos, doble cono y carrito de manipulación', NULL, false, 'ok_nook', 28),
('SEGURIDAD', 'La carga está debidamente asegurada', 'Los pallets están alineados con el chasis para un correcto funcionamiento de las cortinas. Revisando que se encuentren los pallets con film stretch, chapadur o cartón según corresponda', false, 'ok_nook', 29),
('SEGURIDAD', 'Inicio Ruta Foxtrot', NULL, false, 'ok_nook', 30);
