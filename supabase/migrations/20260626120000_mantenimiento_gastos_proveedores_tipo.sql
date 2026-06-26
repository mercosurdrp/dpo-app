-- Gastos de mantenimiento: catálogo de proveedores reutilizable + tipo de mantenimiento.
--  1) Tabla `mantenimiento_proveedores`: alta de proveedores desde el form de gasto (botón "+"),
--     quedan registrados para próximas cargas (selector). Texto único normalizado.
--  2) Columna `tipo_mantenimiento` en `mantenimiento_gastos`: a qué tipo de mantenimiento
--     corresponde el gasto (preventivo / correctivo / proactivo). NULL = "no corresponde".
-- Módulo solo Pampeana (la flota de Misiones se gestiona en Cloudfleet).

BEGIN;

-- ───────────────────────── Catálogo de proveedores ─────────────────────────
CREATE TABLE IF NOT EXISTS mantenimiento_proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  activo     boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Único case-insensitive y sin espacios al borde, para no duplicar proveedores.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mant_proveedores_norm
  ON mantenimiento_proveedores (upper(btrim(nombre)));

ALTER TABLE mantenimiento_proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mantenimiento_proveedores_read ON mantenimiento_proveedores;
CREATE POLICY mantenimiento_proveedores_read ON mantenimiento_proveedores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS mantenimiento_proveedores_write ON mantenimiento_proveedores;
CREATE POLICY mantenimiento_proveedores_write ON mantenimiento_proveedores
  FOR ALL TO authenticated
  USING (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin', 'supervisor'])))
  WITH CHECK (exists (select 1 from profiles p where p.id = auth.uid()
                 and p.role::text = any (array['admin', 'supervisor'])));

-- Sembrar el catálogo con los proveedores ya cargados a mano en gastos previos.
INSERT INTO mantenimiento_proveedores (nombre)
SELECT DISTINCT btrim(proveedor)
FROM mantenimiento_gastos
WHERE proveedor IS NOT NULL AND btrim(proveedor) <> ''
ON CONFLICT DO NOTHING;

-- ───────────────────────── Tipo de mantenimiento del gasto ─────────────────────────
ALTER TABLE mantenimiento_gastos
  ADD COLUMN IF NOT EXISTS tipo_mantenimiento text
  CHECK (tipo_mantenimiento IS NULL
         OR tipo_mantenimiento IN ('preventivo', 'correctivo', 'proactivo'));

COMMIT;
