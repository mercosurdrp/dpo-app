-- =============================================================
-- 054 — rechazos: columnas nuevas (PR 1)
-- =============================================================
-- - chofer:         persona física (Foxtrot ∥ mapeo_patente_chofer)
-- - monto_*:        para KPIs "monto rechazado" + "ticket promedio"
-- - ds_*:           dimensiones para filtros/heatmap V2
-- - fecha_pedido:   para análisis de lead time
-- - id_documento:   FCVTA / DVVTA / etc.
-- Idempotente vía IF NOT EXISTS. Se puede aplicar también en Misiones
-- (donde `chofer` ya existe → ADD COLUMN IF NOT EXISTS es no-op).

ALTER TABLE rechazos
  ADD COLUMN IF NOT EXISTS chofer            TEXT,
  ADD COLUMN IF NOT EXISTS monto_neto        NUMERIC,
  ADD COLUMN IF NOT EXISTS monto_bruto       NUMERIC,
  ADD COLUMN IF NOT EXISTS internos          NUMERIC,
  ADD COLUMN IF NOT EXISTS ds_localidad      TEXT,
  ADD COLUMN IF NOT EXISTS ds_provincia      TEXT,
  ADD COLUMN IF NOT EXISTS ds_canal_mkt      TEXT,
  ADD COLUMN IF NOT EXISTS ds_subcanal_mkt   TEXT,
  ADD COLUMN IF NOT EXISTS ds_segmento_mkt   TEXT,
  ADD COLUMN IF NOT EXISTS ds_supervisor     TEXT,
  ADD COLUMN IF NOT EXISTS ds_gerente        TEXT,
  ADD COLUMN IF NOT EXISTS id_sucursal       INT,
  ADD COLUMN IF NOT EXISTS ds_sucursal       TEXT,
  ADD COLUMN IF NOT EXISTS fecha_pedido      DATE,
  ADD COLUMN IF NOT EXISTS id_documento      TEXT;

CREATE INDEX IF NOT EXISTS idx_rechazos_chofer        ON rechazos(chofer);
CREATE INDEX IF NOT EXISTS idx_rechazos_localidad     ON rechazos(ds_localidad);
CREATE INDEX IF NOT EXISTS idx_rechazos_canal_mkt     ON rechazos(ds_canal_mkt);
CREATE INDEX IF NOT EXISTS idx_rechazos_supervisor    ON rechazos(ds_supervisor);
CREATE INDEX IF NOT EXISTS idx_rechazos_id_documento  ON rechazos(id_documento);

-- Deprecation marker: bultos_entregados se sigue llenando para no romper
-- nada, pero ninguna query nueva la debe usar como denominador.
COMMENT ON COLUMN rechazos.bultos_entregados IS
  'DEPRECATED: usar ventas_diarias.total_bultos como denominador. No usar en queries nuevas.';
