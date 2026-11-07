-- =============================================
-- Flota 2.3 · Cumplimiento de los ANS con proveedores (R2.3.1a / R2.3.2a / R3.1.4)
--
-- El 06/11/2026 se firmaron 6 de los 7 acuerdos de nivel de servicio con los
-- proveedores de flota (Bettiolo, Luval, Pagnanini, Don Gregorio, SCRAM-Sosa,
-- Costanzi; falta Todo Pesado). Todos dicen lo mismo en la cláusula 5: «Mercosur
-- registra para cada pedido u OT la fecha y hora del pedido, la FECHA
-- COMPROMETIDA por el proveedor y la fecha real de entrega, y con eso calcula los
-- indicadores el primer día hábil de cada mes». Hasta hoy la app no guardaba la
-- fecha comprometida en ningún lado: sin ella la puntualidad (meta ≥ 95 % en los
-- 7 acuerdos) no se puede medir.
--
--   1. mantenimiento_realizados.salida_comprometida: cuándo dijo el taller que
--      entregaba la unidad (puntualidad de talleres y carrocería).
--   2. mantenimiento_pedidos: fecha comprometida, si llegó completo, si la pieza
--      es del Anexo A (crítica) y si el proveedor la tenía al pedirla.
--   3. extintor_recargas: retiro y devolución de matafuegos (≤ 72 h hábiles).
--   4. flota_ans: qué proveedor tiene ANS, de qué tipo, firma y vencimiento, y el
--      PDF firmado (sla_adjuntos) — antes la app buscaba el nombre del proveedor
--      dentro del texto del SLA y no encontraba ninguno.
--   5. flota_ans_planes: el plan de acción por escrito que exige la cláusula 6
--      cuando un indicador del mes no llega al 100 %.
--
-- Idempotente. Solo Pampeana (el módulo de mantenimiento no corre en Misiones).
-- =============================================

BEGIN;

-- 1. OT: entrega comprometida por el taller
ALTER TABLE mantenimiento_realizados
  ADD COLUMN IF NOT EXISTS salida_comprometida TIMESTAMPTZ;
COMMENT ON COLUMN mantenimiento_realizados.salida_comprometida IS
  'Fecha/hora de entrega que comprometió el taller (ANS, cláusula 3). Puntualidad = salida_taller <= salida_comprometida.';

-- 2. Pedidos de repuestos
ALTER TABLE mantenimiento_pedidos
  ADD COLUMN IF NOT EXISTS fecha_comprometida DATE,
  ADD COLUMN IF NOT EXISTS entrega_completa BOOLEAN,
  ADD COLUMN IF NOT EXISTS es_critico BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disponible_al_pedir BOOLEAN;
COMMENT ON COLUMN mantenimiento_pedidos.fecha_comprometida IS 'Fecha de entrega que confirmó el proveedor (ANS repuestos).';
COMMENT ON COLUMN mantenimiento_pedidos.entrega_completa IS 'Llegó completo y correcto. NULL = sin dato.';
COMMENT ON COLUMN mantenimiento_pedidos.es_critico IS 'Pieza del Anexo A (repuestos críticos de la flota).';
COMMENT ON COLUMN mantenimiento_pedidos.disponible_al_pedir IS 'El proveedor la tenía en stock al pedirla. NULL = sin dato.';

-- 3. Recargas de matafuegos
CREATE TABLE IF NOT EXISTS extintor_recargas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor TEXT,
  fecha_retiro DATE NOT NULL,
  fecha_devolucion DATE,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  reemplazo_dejado BOOLEAN,
  observaciones TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extintor_recargas_retiro ON extintor_recargas(fecha_retiro);

-- 4. ANS por proveedor
CREATE TABLE IF NOT EXISTS flota_ans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id UUID NOT NULL UNIQUE REFERENCES mantenimiento_proveedores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('taller', 'carroceria', 'repuestos', 'matafuegos')),
  fecha_firma DATE,
  fecha_vencimiento DATE,
  sla_adjunto_id UUID REFERENCES sla_adjuntos(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Planes de acción por incumplimiento
CREATE TABLE IF NOT EXISTS flota_ans_planes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ans_id UUID NOT NULL REFERENCES flota_ans(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  indicador TEXT NOT NULL,
  valor NUMERIC,
  meta NUMERIC,
  causa TEXT,
  accion TEXT NOT NULL,
  responsable TEXT,
  fecha_compromiso DATE,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  fecha_cierre DATE,
  resultado TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flota_ans_planes_periodo ON flota_ans_planes(ans_id, year, mes);

-- RLS: lectura para autenticados, escritura admin/supervisor (mismo criterio que extintores)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['extintor_recargas', 'flota_ans', 'flota_ans_planes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role::text IN (''admin'', ''supervisor'')))
         WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (SELECT auth.uid()) AND p.role::text IN (''admin'', ''supervisor'')))',
      t || '_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', 'trg_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- =============================================
-- Datos: proveedores con ANS (firmados el 06/11/2026) y sus datos de los acuerdos
-- =============================================

-- Don Gregorio y Todo Pesado venden repuestos (estaban marcados como taller).
UPDATE mantenimiento_proveedores SET es_repuestos = true, es_taller = false
 WHERE nombre IN ('DON GREGORIO SA REPUESTOS MERCEDES BENZ', 'TODO PESADO REPUESTOS Y ACCESORIOS');

-- CUIT, razón social y mail tal como figuran en los acuerdos firmados (solo si estaban vacíos).
UPDATE mantenimiento_proveedores p SET
  cuit = COALESCE(p.cuit, d.cuit),
  razon_social = COALESCE(p.razon_social, d.razon_social),
  email = COALESCE(p.email, d.email)
FROM (VALUES
  ('BETTIOLO MARTIN EUGENIO TALLER INTEGRAL LOS SAUCES', '20-25016801-3', 'BETTIOLO MARTIN EUGENIO', 'martinbettiolo@yahoo.com.ar'),
  ('Luval', '30-71834924-5', 'LUVAL JUFRA S.R.L.', NULL),
  ('Pagnanini SERGIO JULIAN', '20-31717775-6', 'PAGNANINI SERGIO JULIAN', NULL),
  ('DON GREGORIO SA REPUESTOS MERCEDES BENZ', '30-70892474-8', 'DON GREGORIO S.A.', 'germanventimiglia@hotmail.com'),
  ('SCRAM - SOSA CRISTIAN', '20-22216992-6', 'SOSA CARLOS CRISTIAN', NULL),
  ('COSTANZI MATAFUEGOS', '27-24329747-3', 'COSTANZI MATAFUEGOS', 'costanzimatafuegos@gmail.com')
) AS d(nombre, cuit, razon_social, email)
WHERE p.nombre = d.nombre;

INSERT INTO flota_ans (proveedor_id, tipo, fecha_firma, fecha_vencimiento, sla_adjunto_id, notas)
SELECT p.id, d.tipo,
       CASE WHEN d.firmado THEN DATE '2026-11-06' END,
       CASE WHEN d.firmado THEN DATE '2027-11-06' END,
       (SELECT a.id FROM sla_adjuntos a WHERE a.nombre_original ILIKE d.adjunto LIMIT 1),
       d.notas
FROM (VALUES
  ('BETTIOLO MARTIN EUGENIO TALLER INTEGRAL LOS SAUCES', 'taller', true, 'ANS Flota - Bettiolo%', NULL),
  ('Luval', 'taller', true, 'ANS Flota - Luval%', NULL),
  ('Pagnanini SERGIO JULIAN', 'carroceria', true, 'ANS Flota - Pagnanini%', NULL),
  ('DON GREGORIO SA REPUESTOS MERCEDES BENZ', 'repuestos', true, 'ANS Flota - Don Gregorio%', NULL),
  ('SCRAM - SOSA CRISTIAN', 'repuestos', true, 'ANS Flota - SCRAM%', 'Firmó Carlos C. Sosa (DNI 22.216.992) = proveedor Chess 963.'),
  ('COSTANZI MATAFUEGOS', 'matafuegos', true, 'ANS Flota - Costanzi%', NULL),
  ('TODO PESADO REPUESTOS Y ACCESORIOS', 'repuestos', false, NULL, 'Acuerdo generado, falta CUIT y firma.')
) AS d(nombre, tipo, firmado, adjunto, notas)
JOIN mantenimiento_proveedores p ON p.nombre = d.nombre
ON CONFLICT (proveedor_id) DO NOTHING;

COMMIT;

-- Verificación:
-- SELECT p.nombre, a.tipo, a.fecha_firma, a.sla_adjunto_id IS NOT NULL AS pdf
--   FROM flota_ans a JOIN mantenimiento_proveedores p ON p.id = a.proveedor_id ORDER BY 2, 1;
