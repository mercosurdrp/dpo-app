-- Módulo Mudanza (depósito nuevo de Presidente Perón, llaves 01/11/2026).
-- Tareas con Gantt y responsable, registro de avances con adjuntos, presupuesto
-- por partida (del Excel "Inversion Mudanza") y gastos con comprobante.
-- Aditiva e idempotente: se puede correr más de una vez.
BEGIN;

-- 1. Configuración (una sola fila)
CREATE TABLE IF NOT EXISTS mudanza_config (
  id            text PRIMARY KEY DEFAULT 'default',
  nombre        text NOT NULL DEFAULT 'Mudanza "Express a San Nicolás"',
  fecha_llaves  date,
  fecha_mudanza date,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO mudanza_config (id, nombre, fecha_llaves) VALUES ('default', 'Mudanza "Express a San Nicolás"', '2026-11-01')
ON CONFLICT (id) DO NOTHING;

-- 2. Tareas
CREATE TABLE IF NOT EXISTS mudanza_tareas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text UNIQUE,
  rubro          text NOT NULL,
  nombre         text NOT NULL,
  responsable_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  inicio         date,            -- planificado
  fin            date,            -- planificado
  inicio_real    date,            -- cuándo arrancó de verdad
  fin_real       date,            -- cuándo terminó de verdad
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','hecha','bloqueada')),
  avance         integer NOT NULL DEFAULT 0 CHECK (avance BETWEEN 0 AND 100),
  hito           boolean NOT NULL DEFAULT false,
  notas          text,
  orden          integer NOT NULL DEFAULT 0,
  created_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mudanza_tareas_fechas CHECK (inicio IS NULL OR fin IS NULL OR fin >= inicio),
  CONSTRAINT mudanza_tareas_fechas_real CHECK (inicio_real IS NULL OR fin_real IS NULL OR fin_real >= inicio_real)
);
ALTER TABLE mudanza_tareas ADD COLUMN IF NOT EXISTS inicio_real date;
ALTER TABLE mudanza_tareas ADD COLUMN IF NOT EXISTS fin_real date;
CREATE INDEX IF NOT EXISTS mudanza_tareas_resp_idx ON mudanza_tareas(responsable_id);

-- 3. Avances (bitácora por tarea; archivos = jsonb [{path,nombre,mime,bytes}])
CREATE TABLE IF NOT EXISTS mudanza_avances (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id   uuid NOT NULL REFERENCES mudanza_tareas(id) ON DELETE CASCADE,
  fecha      date NOT NULL DEFAULT CURRENT_DATE,
  avance     integer NOT NULL CHECK (avance BETWEEN 0 AND 100),
  estado     text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('pendiente','en_curso','hecha','bloqueada')),
  comentario text,
  archivos   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mudanza_avances_tarea_idx ON mudanza_avances(tarea_id, fecha DESC);

-- 4. Partidas de presupuesto
CREATE TABLE IF NOT EXISTS mudanza_partidas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubro      text NOT NULL,
  nombre     text NOT NULL,
  cantidad   numeric(12,2) NOT NULL DEFAULT 1,
  unitario   numeric(14,2) NOT NULL DEFAULT 0,
  monto      numeric(14,2) NOT NULL DEFAULT 0,
  notas      text,
  orden      integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Gastos (comprometido = orden/factura pendiente; pagado = ya salió la plata)
CREATE TABLE IF NOT EXISTS mudanza_gastos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partida_id uuid REFERENCES mudanza_partidas(id) ON DELETE SET NULL,
  tarea_id   uuid REFERENCES mudanza_tareas(id) ON DELETE SET NULL,
  rubro      text NOT NULL,
  fecha      date NOT NULL DEFAULT CURRENT_DATE,
  proveedor  text,
  concepto   text NOT NULL,
  monto      numeric(14,2) NOT NULL CHECK (monto >= 0),
  estado     text NOT NULL DEFAULT 'pagado' CHECK (estado IN ('comprometido','pagado')),
  archivos   jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas      text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mudanza_gastos_partida_idx ON mudanza_gastos(partida_id);

-- 6. updated_at
DROP TRIGGER IF EXISTS trg_mudanza_tareas_updated_at ON mudanza_tareas;
CREATE TRIGGER trg_mudanza_tareas_updated_at BEFORE UPDATE ON mudanza_tareas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_mudanza_partidas_updated_at ON mudanza_partidas;
CREATE TRIGGER trg_mudanza_partidas_updated_at BEFORE UPDATE ON mudanza_partidas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_mudanza_gastos_updated_at ON mudanza_gastos;
CREATE TRIGGER trg_mudanza_gastos_updated_at BEFORE UPDATE ON mudanza_gastos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_mudanza_config_updated_at ON mudanza_config;
CREATE TRIGGER trg_mudanza_config_updated_at BEFORE UPDATE ON mudanza_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Permisos: editores (admin, supervisor, admin_rrhh) escriben todo;
--    el responsable de una tarea puede cargar avances de esa tarea y actualizarla.
CREATE OR REPLACE FUNCTION es_editor_mudanza() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh'))
$$;
CREATE OR REPLACE FUNCTION puede_avanzar_mudanza_tarea(p_tarea uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT es_editor_mudanza() OR EXISTS (SELECT 1 FROM mudanza_tareas WHERE id = p_tarea AND responsable_id = auth.uid())
$$;

ALTER TABLE mudanza_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mudanza_tareas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mudanza_avances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mudanza_partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mudanza_gastos   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mudanza_config_select_auth" ON mudanza_config;
CREATE POLICY "mudanza_config_select_auth" ON mudanza_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mudanza_config_write_editors" ON mudanza_config;
CREATE POLICY "mudanza_config_write_editors" ON mudanza_config FOR ALL TO authenticated USING (es_editor_mudanza()) WITH CHECK (es_editor_mudanza());

DROP POLICY IF EXISTS "mudanza_tareas_select_auth" ON mudanza_tareas;
CREATE POLICY "mudanza_tareas_select_auth" ON mudanza_tareas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mudanza_tareas_write_editors" ON mudanza_tareas;
CREATE POLICY "mudanza_tareas_write_editors" ON mudanza_tareas FOR ALL TO authenticated USING (es_editor_mudanza()) WITH CHECK (es_editor_mudanza());
DROP POLICY IF EXISTS "mudanza_tareas_update_responsable" ON mudanza_tareas;
CREATE POLICY "mudanza_tareas_update_responsable" ON mudanza_tareas FOR UPDATE TO authenticated
  USING (responsable_id = auth.uid()) WITH CHECK (responsable_id = auth.uid());

DROP POLICY IF EXISTS "mudanza_avances_select_auth" ON mudanza_avances;
CREATE POLICY "mudanza_avances_select_auth" ON mudanza_avances FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mudanza_avances_insert_resp" ON mudanza_avances;
CREATE POLICY "mudanza_avances_insert_resp" ON mudanza_avances FOR INSERT TO authenticated WITH CHECK (puede_avanzar_mudanza_tarea(tarea_id));
DROP POLICY IF EXISTS "mudanza_avances_delete_editors" ON mudanza_avances;
CREATE POLICY "mudanza_avances_delete_editors" ON mudanza_avances FOR DELETE TO authenticated USING (es_editor_mudanza() OR created_by = auth.uid());

DROP POLICY IF EXISTS "mudanza_partidas_select_auth" ON mudanza_partidas;
CREATE POLICY "mudanza_partidas_select_auth" ON mudanza_partidas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mudanza_partidas_write_editors" ON mudanza_partidas;
CREATE POLICY "mudanza_partidas_write_editors" ON mudanza_partidas FOR ALL TO authenticated USING (es_editor_mudanza()) WITH CHECK (es_editor_mudanza());

DROP POLICY IF EXISTS "mudanza_gastos_select_auth" ON mudanza_gastos;
CREATE POLICY "mudanza_gastos_select_auth" ON mudanza_gastos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mudanza_gastos_write_editors" ON mudanza_gastos;
CREATE POLICY "mudanza_gastos_write_editors" ON mudanza_gastos FOR ALL TO authenticated USING (es_editor_mudanza()) WITH CHECK (es_editor_mudanza());

GRANT ALL ON mudanza_config, mudanza_tareas, mudanza_avances, mudanza_partidas, mudanza_gastos TO anon, authenticated, service_role;

-- 8. Bucket privado para adjuntos de avances y comprobantes de gastos
INSERT INTO storage.buckets (id, name, public) VALUES ('mudanza', 'mudanza', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "mudanza_storage_select" ON storage.objects;
CREATE POLICY "mudanza_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'mudanza');
DROP POLICY IF EXISTS "mudanza_storage_insert" ON storage.objects;
CREATE POLICY "mudanza_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mudanza');
DROP POLICY IF EXISTS "mudanza_storage_delete" ON storage.objects;
CREATE POLICY "mudanza_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'mudanza' AND es_editor_mudanza());

-- 9. Semilla: 47 tareas del listado del 29/09/2026 (sin responsable ni fechas, salvo el hito de llaves)
INSERT INTO mudanza_tareas (codigo, rubro, nombre, inicio, fin, estado, avance, hito, notas, orden) VALUES
('h01','Hitos','Entrega de llaves','2026-11-01','2026-11-01','pendiente',0,true,'A partir de acá arrancan habilitaciones y obra.',10),
('h02','Hitos','Fin de obra',NULL,NULL,'pendiente',0,true,'',20),
('h03','Hitos','Fin de sistemas (red, WMS y servidor operativos)',NULL,NULL,'pendiente',0,true,'',30),
('h04','Hitos','Día de mudanza',NULL,NULL,'pendiente',0,true,'Cargar también como Fecha de mudanza arriba a la derecha.',40),
('h05','Hitos','Primer reparto desde el depósito nuevo',NULL,NULL,'pendiente',0,true,'',50),
('h06','Hitos','Entrega del depósito viejo',NULL,NULL,'pendiente',0,true,'Acta de entrega con fotos.',60),
('l01','Habilitaciones y legales','Habilitación municipal del depósito nuevo',NULL,NULL,'pendiente',0,false,'Planos, final de obra y bomberos. Requiere carga de fuego y matafuegos dimensionados.',70),
('l02','Habilitaciones y legales','ARCA: cambio de domicilio fiscal y del depósito',NULL,NULL,'pendiente',0,false,'En dpo-app la habilitación ARCA vigente vence el 15/10/2026: renovar ya con el domicilio nuevo.',80),
('l03','Habilitaciones y legales','Ingresos Brutos: cambio de domicilio',NULL,NULL,'pendiente',0,false,'',90),
('l04','Habilitaciones y legales','REBA para el domicilio nuevo',NULL,NULL,'pendiente',0,false,'Hoy en dpo-app hay REBA Ramallo, Pergamino y San Nicolás. El del depósito se tramita por domicilio.',100),
('l05','Habilitaciones y legales','Carga de fuego del depósito nuevo',NULL,NULL,'pendiente',0,false,'Define cantidad y tipo de matafuegos. Requisito de dpo-app (actual vence 13/08/2027, pero es por edificio).',110),
('l06','Habilitaciones y legales','Estudios HSMA en el depósito nuevo (6)',NULL,NULL,'pendiente',0,false,'Análisis de agua, ruido, iluminación, puesta a tierra, carga térmica y vibraciones. Son los que hoy figuran en dpo-app; se rehacen por edificio, después de obra y con la nave iluminada.',120),
('l07','Habilitaciones y legales','Póliza integral: endoso al domicilio nuevo + seguro de mercadería en tránsito',NULL,NULL,'pendiente',0,false,'Cubrir stock en ambos depósitos durante los días de traslado.',130),
('l08','Habilitaciones y legales','ART: alta del establecimiento nuevo y relevamiento de riesgos',NULL,NULL,'pendiente',0,false,'Póliza ART en dpo-app vence 31/12/2026.',140),
('l09','Habilitaciones y legales','Aviso a Quilmes: cambio de domicilio para acarreo y sistemas',NULL,NULL,'pendiente',0,false,'Domicilio de entrega de acarreos, comodato de paletas y datos en sus sistemas.',150),
('o01','Obra civil','Durlock: tesorería y sala de conteo',NULL,NULL,'pendiente',0,false,'Bloque de oficinas del fondo, según layout 3D.',160),
('o02','Obra civil','Construcción de comedor',NULL,NULL,'pendiente',0,false,'',170),
('o03','Obra civil','Pintura de piso y demarcación (zonas, sendas, zonas seguras)',NULL,NULL,'pendiente',0,false,'Antes de trasladar racks y stock.',180),
('o04','Obra civil','Herrería: rejas de picking y zonas seguras',NULL,NULL,'pendiente',0,false,'Reja perimetral de picking, acceso peatonal, ventana de transferencia y zonas seguras de chofer.',190),
('o05','Obra civil','Sala de baterías de zorras en reempaque',NULL,NULL,'pendiente',0,false,'Con ventilación y tomas para cargadores.',200),
('o06','Obra civil','Aire acondicionado',NULL,NULL,'pendiente',0,false,'6 equipos según el Excel de inversión.',210),
('o07','Obra civil','Dimensionamiento y colocación de matafuegos',NULL,NULL,'pendiente',0,false,'Hoy hay 19 extintores mapeados en dpo-app para el depósito actual. Se redimensiona con la carga de fuego nueva.',220),
('o08','Obra civil','Cartelería y señalización',NULL,NULL,'pendiente',0,false,'Evacuación, zonas, peso límite de camiones, apilado máximo de cajones.',230),
('o09','Obra civil','Luces de emergencia',NULL,NULL,'pendiente',0,false,'',240),
('o10','Obra civil','Colocación de botiquines',NULL,NULL,'pendiente',0,false,'',250),
('s01','Seguridad electrónica','Cámaras',NULL,NULL,'pendiente',0,false,'Pueden colgarse de los switches PoE del plano de red.',260),
('s02','Seguridad electrónica','Alarma (tesorería y depósito)',NULL,NULL,'pendiente',0,false,'',270),
('s03','Seguridad electrónica','Control de acceso',NULL,NULL,'pendiente',0,false,'',280),
('i01','Sistemas e internet','Internet Starlink: antena y gabinete principal',NULL,NULL,'pendiente',0,false,'Paso 1 del plano de red.',290),
('i02','Sistemas e internet','Bocas de red en oficinas (12)',NULL,NULL,'pendiente',0,false,'Después del durlock.',300),
('i03','Sistemas e internet','Access points U7 Pro Max (6) y gabinete 2',NULL,NULL,'pendiente',0,false,'Etapa 1 inalámbrica, etapa 2 con bandeja por pared oeste. Probar Wi-Fi en cada pasillo antes de mudar el stock.',310),
('i04','Sistemas e internet','Traslado del servidor con cableado',NULL,NULL,'pendiente',0,false,'Backup completo antes de mover.',320),
('i05','Sistemas e internet','Traslado de sistemas (PCs, impresoras, terminales)',NULL,NULL,'pendiente',0,false,'',330),
('i06','Sistemas e internet','WMS: nueva disposición de ubicaciones',NULL,NULL,'pendiente',0,false,'Cargar posiciones del layout nuevo antes del conteo inicial.',340),
('i07','Sistemas e internet','Reprogramar punto de partida de las rutas',NULL,NULL,'pendiente',0,false,'Rutas de reparto y de promotores; kilómetros base del costo por PDV.',350),
('i08','Sistemas e internet','Antena de 25 m: averiguar si conviene trasladarla',NULL,NULL,'pendiente',0,false,'Decidir antes de fin de obra. Si no se traslada, desmontaje y baja.',360),
('tr01','Traslados y equipamiento','Traslado y colocación de racks',NULL,NULL,'pendiente',0,false,'Después de pintura de piso. Requiere vaciar los racks del depósito viejo primero.',370),
('tr02','Traslados y equipamiento','Alquiler de autoelevadores extra',NULL,NULL,'pendiente',0,false,'Uno en cada depósito durante los días de traslado.',380),
('tr03','Traslados y equipamiento','Traslado de generador',NULL,NULL,'pendiente',0,false,'',390),
('tr04','Traslados y equipamiento','Traslado de mobiliario',NULL,NULL,'pendiente',0,false,'5 viajes según el Excel de inversión.',400),
('tr05','Traslados y equipamiento','Traslado de cajas fuertes',NULL,NULL,'pendiente',0,false,'Con tesorería y alarma ya terminadas.',410),
('tr06','Traslados y equipamiento','Traslado de vacíos',NULL,NULL,'pendiente',0,false,'25 viajes. Contar paletas de comodato antes y después.',420),
('tr07','Traslados y equipamiento','Conteo de stock el día anterior',NULL,NULL,'pendiente',0,false,'Stock bajo: pedir menos a Quilmes las dos semanas previas.',430),
('tr08','Traslados y equipamiento','Traslado de stock (litro y mercadería)',NULL,NULL,'pendiente',0,false,'50 viajes. Primero lo que no rota, último el picking.',440),
('tr09','Traslados y equipamiento','Conteo de stock al terminar el pasaje',NULL,NULL,'pendiente',0,false,'Cierra contra el conteo del día anterior.',450),
('p01','Personal y comunicación','Aviso a la dotación: fecha, dirección nueva y cómo llegar',NULL,NULL,'pendiente',0,false,'',460),
('v01','Depósito viejo','Reacondicionamiento del depósito viejo',NULL,NULL,'pendiente',0,false,'Baja de servicios, retiro de cartelería y acta de entrega.',470)
ON CONFLICT (codigo) DO NOTHING;

-- 10. Semilla: partidas del Excel "Inversion Mudanza.xlsx" (total $72.892.000)
INSERT INTO mudanza_partidas (rubro, nombre, cantidad, unitario, monto, orden)
SELECT v.rubro, v.nombre, v.cantidad, v.unitario, v.monto, v.orden
FROM (VALUES
('Habilitaciones y legales','Habilitación / estudios',1,2500000,2500000,10),
('Obra civil','División durlock',1,2000000,2000000,20),
('Obra civil','Pintura de piso',1,2000000,2000000,30),
('Obra civil','Armado de racks',1,10000000,10000000,40),
('Obra civil','Herrería rejas',1,3000000,3000000,50),
('Obra civil','Movimiento aire acondicionado',6,400000,2400000,60),
('Seguridad electrónica','Alarma tesorería',1,1000000,1000000,70),
('Seguridad electrónica','Cámaras',1,30000000,30000000,80),
('Sistemas e internet','Sistemas',1,0,0,90),
('Traslados y equipamiento','Movimientos contenedor',2,1300000,2600000,100),
('Traslados y equipamiento','Movimiento de mercadería (viajes)',80,50000,4000000,110),
('Traslados y equipamiento','Alquiler autoelevador',1,1000000,1000000,120),
('Traslados y equipamiento','Traslado',1,0,0,130),
('Personal y comunicación','HH Personal',672,11000,7392000,140),
('Depósito viejo','Reacondicionamiento depósito actual',1,5000000,5000000,150)
) AS v(rubro, nombre, cantidad, unitario, monto, orden)
WHERE NOT EXISTS (SELECT 1 FROM mudanza_partidas p WHERE p.nombre = v.nombre);

-- 11. Equipo de la mudanza: solo estos perfiles pueden ser responsables de tareas
CREATE TABLE IF NOT EXISTS mudanza_equipo (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  orden      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mudanza_equipo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mudanza_equipo_select_auth" ON mudanza_equipo;
CREATE POLICY "mudanza_equipo_select_auth" ON mudanza_equipo FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mudanza_equipo_write_editors" ON mudanza_equipo;
CREATE POLICY "mudanza_equipo_write_editors" ON mudanza_equipo FOR ALL TO authenticated USING (es_editor_mudanza()) WITH CHECK (es_editor_mudanza());
GRANT ALL ON mudanza_equipo TO anon, authenticated, service_role;
INSERT INTO mudanza_equipo (profile_id, orden)
SELECT p.id, v.orden FROM (VALUES
  ('abde2766-605c-41de-a734-71f9e27cea69'::uuid, 10),  -- Esteban Altube
  ('41d38555-7a9b-454d-ae47-9afa3a7e5aa7'::uuid, 20),  -- Sebastian Roselli
  ('e579be0a-64ef-4572-8a55-c0fbfe03e57f'::uuid, 30),  -- Fausto Azzaretti
  ('e681193d-812e-4c16-82bc-19220b20bd21'::uuid, 40)   -- Ezequiel Teves
) AS v(id, orden) JOIN profiles p ON p.id = v.id
ON CONFLICT (profile_id) DO NOTHING;

COMMIT;
