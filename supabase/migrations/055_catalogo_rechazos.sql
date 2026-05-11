-- =============================================================
-- 055 — catalogo_rechazos: categorización fuera del código TS
-- =============================================================
-- Reemplaza el mapping hardcodeado en src/actions/rechazos.ts.
-- `categoria` agrupa para reporting; `controlable` indica si la mesa
-- puede actuar (sirve para KPI "% controlable").
-- Si Chess agrega un id_rechazo nuevo, entra con categoría POR_CLASIFICAR
-- (default) hasta que el operador la confirme en el admin.

CREATE TABLE IF NOT EXISTS catalogo_rechazos (
  id_rechazo  INT PRIMARY KEY,
  ds_rechazo  TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'POR_CLASIFICAR' CHECK (categoria IN (
    'Logística', 'Ventas', 'Cliente', 'Interno', 'Externo', 'POR_CLASIFICAR'
  )),
  controlable BOOLEAN NOT NULL DEFAULT false,
  activo      BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalogo_rechazos_categoria ON catalogo_rechazos(categoria);

ALTER TABLE catalogo_rechazos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogo_rechazos_read_authenticated" ON catalogo_rechazos;
CREATE POLICY "catalogo_rechazos_read_authenticated" ON catalogo_rechazos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "catalogo_rechazos_all_service" ON catalogo_rechazos;
CREATE POLICY "catalogo_rechazos_all_service" ON catalogo_rechazos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed: 16 motivos relevados en Pampeana hasta 2026-05-11.
-- ON CONFLICT DO NOTHING para que se pueda re-correr la migración.
INSERT INTO catalogo_rechazos (id_rechazo, ds_rechazo, categoria, controlable) VALUES
  ( 1, 'CERRADO',                              'Cliente',   false),
  ( 2, 'CAMINO INTRANSITABLE - ZONA PELIGROSA','Externo',   false),
  ( 3, 'ERROR DE CARGA',                       'Logística', true ),
  ( 4, 'HORARIO FLETERO - SINDICAL',           'Externo',   false),
  ( 5, 'MAL FACTURADO',                        'Interno',   true ),
  ( 6, 'SIN DINERO',                           'Cliente',   false),
  ( 7, 'FECHA CORTA',                          'Logística', true ),
  ( 8, 'MAL GEOCODIFICADO',                    'Interno',   true ),
  ( 9, 'PRODUCTO NO APTO',                     'Logística', true ),
  (10, 'SIN ENVASES',                          'Ventas',    true ),
  (11, 'ROTURA DE CAMION - SINIESTRO',         'Externo',   false),
  (12, 'ERROR DE PREVENTA',                    'Ventas',    true ),
  (13, 'SIN STOCK',                            'Logística', true ),
  (15, 'ERROR DE DISTRIBUCIO',                 'Logística', true ),
  (19, 'DEV X TRAMITES INTER',                 'Interno',   false),
  (21, 'BEES',                                 'Ventas',    true )
ON CONFLICT (id_rechazo) DO NOTHING;
