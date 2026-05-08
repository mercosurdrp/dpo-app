-- =============================================
-- 041 · Orden de Salida Diario (módulo /orden-salida)
-- =============================================
-- Modelo: tabla por camión + tabla aparte de personal que no sale.
-- Idempotente · multi-tenant safe (Pampeana + Distribuciones).
-- =============================================

BEGIN;

-- =============================================
-- 1) Sucursal en empleados
-- =============================================
-- Necesaria para distinguir Eldorado / Iguazú dentro del sector "Distribución".
-- Default NULL: empleados que no aplican (ej. depósito Pampeana sin sucursal).
ALTER TABLE empleados
  ADD COLUMN IF NOT EXISTS sucursal text
  CHECK (sucursal IS NULL OR sucursal IN ('ELDORADO', 'IGUAZU'));

CREATE INDEX IF NOT EXISTS idx_empleados_sucursal ON empleados(sucursal);

COMMENT ON COLUMN empleados.sucursal IS
  'Sucursal operativa para distribución Misiones (ELDORADO / IGUAZU). NULL si no aplica.';


-- =============================================
-- 2) Flota: catalogo_vehiculos extendido (sucursal + capacidad + número)
-- =============================================
-- Tabla satélite para no contaminar catalogo_vehiculos con campos solo útiles
-- al módulo de Orden de Salida. PK = vehiculo_id (1:1).
CREATE TABLE IF NOT EXISTS orden_salida_flota (
  vehiculo_id     uuid    PRIMARY KEY REFERENCES catalogo_vehiculos(id) ON DELETE CASCADE,
  sucursal        text    NOT NULL CHECK (sucursal IN ('ELDORADO', 'IGUAZU')),
  capacidad_kg    numeric,
  numero_unidad   int,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orden_salida_flota_sucursal
  ON orden_salida_flota(sucursal) WHERE activo;


-- =============================================
-- 3) Titulares (chofer fijo de un camión, ej. titulares Iguazú)
-- =============================================
CREATE TABLE IF NOT EXISTS orden_salida_titulares (
  empleado_id     uuid PRIMARY KEY REFERENCES empleados(id) ON DELETE CASCADE,
  camion_id       uuid NOT NULL REFERENCES catalogo_vehiculos(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orden_salida_titulares_camion
  ON orden_salida_titulares(camion_id);


-- =============================================
-- 4) Asignación diaria por camión
-- =============================================
CREATE TABLE IF NOT EXISTS orden_salida_camion_diario (
  fecha                   date    NOT NULL,
  camion_id               uuid    NOT NULL REFERENCES catalogo_vehiculos(id) ON DELETE CASCADE,
  chofer_empleado_id      uuid    REFERENCES empleados(id) ON DELETE SET NULL,
  ayudante_empleado_id    uuid    REFERENCES empleados(id) ON DELETE SET NULL,
  zona                    text    NOT NULL DEFAULT '',
  estado                  text    NOT NULL DEFAULT 'sin_asignar'
    CHECK (estado IN ('operativo','sin_asignar','sin_carga','fuera_servicio','taller')),
  observacion             text    NOT NULL DEFAULT '',
  clientes                int,
  sobrecarga_completa     int,
  media_sobrecarga        int,
  cuarto_sobrecarga       int,
  bultos                  int,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, camion_id)
);

CREATE INDEX IF NOT EXISTS idx_orden_salida_camion_diario_fecha
  ON orden_salida_camion_diario(fecha);
CREATE INDEX IF NOT EXISTS idx_orden_salida_camion_diario_chofer
  ON orden_salida_camion_diario(chofer_empleado_id) WHERE chofer_empleado_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orden_salida_camion_diario_ayudante
  ON orden_salida_camion_diario(ayudante_empleado_id) WHERE ayudante_empleado_id IS NOT NULL;


-- =============================================
-- 5) Personal que no sale (queda en depósito / vacaciones / etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS orden_salida_personal_no_sale (
  fecha           date NOT NULL,
  empleado_id     uuid NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  motivo          text NOT NULL
    CHECK (motivo IN ('deposito','vacaciones','licencia','ausente','suspendido','franco','otro')),
  detalle         text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, empleado_id)
);

CREATE INDEX IF NOT EXISTS idx_orden_salida_personal_no_sale_fecha
  ON orden_salida_personal_no_sale(fecha);


-- =============================================
-- 6) Triggers updated_at
-- =============================================
CREATE OR REPLACE FUNCTION orden_salida_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_salida_camion_diario_updated_at ON orden_salida_camion_diario;
CREATE TRIGGER trg_orden_salida_camion_diario_updated_at
  BEFORE UPDATE ON orden_salida_camion_diario
  FOR EACH ROW EXECUTE FUNCTION orden_salida_set_updated_at();

DROP TRIGGER IF EXISTS trg_orden_salida_personal_no_sale_updated_at ON orden_salida_personal_no_sale;
CREATE TRIGGER trg_orden_salida_personal_no_sale_updated_at
  BEFORE UPDATE ON orden_salida_personal_no_sale
  FOR EACH ROW EXECUTE FUNCTION orden_salida_set_updated_at();

DROP TRIGGER IF EXISTS trg_orden_salida_flota_updated_at ON orden_salida_flota;
CREATE TRIGGER trg_orden_salida_flota_updated_at
  BEFORE UPDATE ON orden_salida_flota
  FOR EACH ROW EXECUTE FUNCTION orden_salida_set_updated_at();


-- =============================================
-- 7) RLS · Patrón:
--    · authenticated lee TODO (vista empleado necesita ver su propio renglón)
--    · admin/admin_rrhh/supervisor escriben (los tres roles confirmados)
-- =============================================
ALTER TABLE orden_salida_flota ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_salida_titulares ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_salida_camion_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE orden_salida_personal_no_sale ENABLE ROW LEVEL SECURITY;

-- flota
DROP POLICY IF EXISTS orden_salida_flota_read ON orden_salida_flota;
CREATE POLICY orden_salida_flota_read
  ON orden_salida_flota FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS orden_salida_flota_write ON orden_salida_flota;
CREATE POLICY orden_salida_flota_write
  ON orden_salida_flota FOR ALL TO authenticated
  USING (auth_role() IN ('admin','admin_rrhh','supervisor'))
  WITH CHECK (auth_role() IN ('admin','admin_rrhh','supervisor'));

-- titulares
DROP POLICY IF EXISTS orden_salida_titulares_read ON orden_salida_titulares;
CREATE POLICY orden_salida_titulares_read
  ON orden_salida_titulares FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS orden_salida_titulares_write ON orden_salida_titulares;
CREATE POLICY orden_salida_titulares_write
  ON orden_salida_titulares FOR ALL TO authenticated
  USING (auth_role() IN ('admin','admin_rrhh','supervisor'))
  WITH CHECK (auth_role() IN ('admin','admin_rrhh','supervisor'));

-- camion_diario
DROP POLICY IF EXISTS orden_salida_camion_diario_read ON orden_salida_camion_diario;
CREATE POLICY orden_salida_camion_diario_read
  ON orden_salida_camion_diario FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS orden_salida_camion_diario_write ON orden_salida_camion_diario;
CREATE POLICY orden_salida_camion_diario_write
  ON orden_salida_camion_diario FOR ALL TO authenticated
  USING (auth_role() IN ('admin','admin_rrhh','supervisor'))
  WITH CHECK (auth_role() IN ('admin','admin_rrhh','supervisor'));

-- personal_no_sale
DROP POLICY IF EXISTS orden_salida_personal_no_sale_read ON orden_salida_personal_no_sale;
CREATE POLICY orden_salida_personal_no_sale_read
  ON orden_salida_personal_no_sale FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS orden_salida_personal_no_sale_write ON orden_salida_personal_no_sale;
CREATE POLICY orden_salida_personal_no_sale_write
  ON orden_salida_personal_no_sale FOR ALL TO authenticated
  USING (auth_role() IN ('admin','admin_rrhh','supervisor'))
  WITH CHECK (auth_role() IN ('admin','admin_rrhh','supervisor'));


-- =============================================
-- 8) SEED · Sucursal en empleados (por nombre)
--    Solo afecta empleados que ya existen en la base con sector='Distribución'.
--    Si algún nombre no está cargado todavía, simplemente no se actualiza
--    (no falla la migración).
-- =============================================
UPDATE empleados SET sucursal = 'IGUAZU'
WHERE sector IN ('Distribución','Distribucion')
  AND upper(nombre) IN (
    'AGUIRRE DIEGO','CHAMULA NELSON','CLOSS GASTON EDUARDO','DUARTE MOISES',
    'GAZTKE FRANCO','KUSI JAVIER GUSTAVO','REICHEL JUAN CARLOS','SERVIN ELADIO',
    'ZEISS RICARDO','ALMEIDA MARCOS EMANUEL','FIGUEROA FERNANDO EMANUEL',
    'NARDI ELIAS MIGUEL'
  );

UPDATE empleados SET sucursal = 'ELDORADO'
WHERE sector IN ('Distribución','Distribucion')
  AND upper(nombre) IN (
    'BENITEZ FABIAN','GARCIA SERGIO','MEDINA RAMON','NUNEZ EDGAR',
    'RAMIREZ OSCAR OMAR','RAMIREZ RAUL IVAN','ROLON VICTOR','BARUA ALVARO',
    'DAVALOS CESAR MATIAS','ESTECHE GABRIEL','GALEANO JUAN','OCAMPO NOLBERTO',
    'PEDERSEN FERNANDO','VAZQUEZ ENZO ADRIAN','CHAMORRO ENRIQUE','VIERA MATIAS',
    'RAMIREZ NAHUEL','RODRIGUEZ ROQUE','BENITEZ NICOLAS','BAEZ ENZO',
    'RAMIREZ HERNAN','PORTILLO ENZO','BRITEZ JOSELO','KIRSZNER BERNARDO',
    'SOLAECHE MARCELO','ARRUA HERNAN','SANCHEZ KEVIN','BAEZ GONZALO',
    'GROCHOWSKI ERNESTO','MARTINEZ ELIAS','ORTIZ BAUTISTA'
  );


-- =============================================
-- 9) SEED · Catálogo de vehículos (camiones de distribución Misiones)
--    ON CONFLICT garantiza idempotencia.
-- =============================================
INSERT INTO catalogo_vehiculos (dominio, descripcion, sector, tipo, active) VALUES
  ('AB386KU', 'Camión IGUAZU',   'distribucion', 'camion', true),
  ('AB386KV', 'Camión IGUAZU',   'distribucion', 'camion', true),
  ('AE445WS', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AE445WT', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AE523XP', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AE591EV', 'Camión IGUAZU',   'distribucion', 'camion', true),
  ('AED 831', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AF399KW', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AF399KX', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AF399KZ', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('AF552QZ', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('FTI 792', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('FUB 570', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('HJR 136', 'Camión IGUAZU',   'distribucion', 'camion', true),
  ('OJA 408', 'Camión IGUAZU',   'distribucion', 'camion', true),
  ('OTB 032', 'Camión ELDORADO', 'distribucion', 'camion', true),
  ('OTY 696', 'Camión ELDORADO', 'distribucion', 'camion', true)
ON CONFLICT (dominio) DO UPDATE
  SET sector = EXCLUDED.sector,
      tipo   = EXCLUDED.tipo,
      active = true;


-- =============================================
-- 10) SEED · orden_salida_flota (sucursal + capacidad + número)
--     Capacidades tomadas de la hoja LISTAS, columnas K (patente) y M (KG).
-- =============================================
INSERT INTO orden_salida_flota (vehiculo_id, sucursal, capacidad_kg, numero_unidad, activo)
SELECT v.id, f.sucursal, f.capacidad_kg, f.numero_unidad, true
FROM catalogo_vehiculos v
JOIN (VALUES
  ('AB386KU', 'IGUAZU',   10200, 20),
  ('AB386KV', 'IGUAZU',   10200, 21),
  ('AE445WS', 'ELDORADO',  9660, 35),
  ('AE445WT', 'ELDORADO',  5220, 36),
  ('AE523XP', 'ELDORADO', 15540, 37),
  ('AE591EV', 'IGUAZU',   10200, 39),
  ('AED 831', 'ELDORADO',  NULL, 13),
  ('AF399KW', 'ELDORADO', 10200, 42),
  ('AF399KX', 'ELDORADO', 10200, 40),
  ('AF399KZ', 'ELDORADO', 10200, NULL),
  ('AF552QZ', 'ELDORADO', 10200, 41),
  ('FTI 792', 'ELDORADO',  4840, 14),
  ('FUB 570', 'ELDORADO',  8650,  3),
  ('HJR 136', 'IGUAZU',    5040,  6),
  ('OJA 408', 'IGUAZU',    5280, 12),
  ('OTB 032', 'ELDORADO',  9560,  8),
  ('OTY 696', 'ELDORADO',  9720,  9)
) AS f(dominio, sucursal, capacidad_kg, numero_unidad)
  ON v.dominio = f.dominio
ON CONFLICT (vehiculo_id) DO UPDATE
  SET sucursal      = EXCLUDED.sucursal,
      capacidad_kg  = EXCLUDED.capacidad_kg,
      numero_unidad = EXCLUDED.numero_unidad,
      activo        = true;


-- =============================================
-- 11) SEED · Titulares Iguazú (5 camiones con chofer fijo confirmado por Enzo)
-- =============================================
INSERT INTO orden_salida_titulares (empleado_id, camion_id)
SELECT e.id, v.id
FROM empleados e, catalogo_vehiculos v
WHERE (
  (upper(e.nombre) = 'AGUIRRE DIEGO'       AND v.dominio = 'AB386KU') OR
  (upper(e.nombre) = 'ZEISS RICARDO'       AND v.dominio = 'AB386KV') OR
  (upper(e.nombre) = 'KUSI JAVIER GUSTAVO' AND v.dominio = 'AE591EV') OR
  (upper(e.nombre) = 'DUARTE MOISES'       AND v.dominio = 'HJR 136') OR
  (upper(e.nombre) = 'SERVIN ELADIO'       AND v.dominio = 'OJA 408')
)
ON CONFLICT (empleado_id) DO UPDATE
  SET camion_id = EXCLUDED.camion_id;

COMMIT;

-- =============================================
-- Notas operativas
-- =============================================
-- Esta migración NO seedea las 1447+360 asignaciones históricas. Eso se hace
-- aparte con el script seed-orden-salida-historico.ts (ver acción siguiente).
-- =============================================
