-- =============================================================
-- 063 — ventas_diarias por vendedor (denominador del ranking)
-- =============================================================
-- Hasta acá ventas_diarias estaba agrupada por (fecha, ds_fletero_carga).
-- Para calcular % de rechazo por vendedor necesitamos también el bultos
-- entregado del vendedor en el período. Agregamos id_vendedor + ds_vendedor
-- y cambiamos el unique constraint para soportar la nueva cardinalidad.
--
-- Si una venta con fletero X tiene vendedor 5 → 10 bultos y otra con
-- el mismo fletero pero vendedor 22 → 5 bultos, ahora son 2 filas. La query
-- por fletero se mantiene (SUM agrupado por ds_fletero_carga sigue dando 15).

ALTER TABLE ventas_diarias
  ADD COLUMN IF NOT EXISTS id_vendedor INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ds_vendedor TEXT;

-- Drop unique viejo si existe (puede llamarse "ventas_diarias_fecha_ds_fletero_carga_key"
-- u otra variante según haya sido creado).
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'ventas_diarias'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE ventas_diarias DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Crear el unique nuevo
ALTER TABLE ventas_diarias
  ADD CONSTRAINT ventas_diarias_fecha_fletero_vendedor_key
  UNIQUE (fecha, ds_fletero_carga, id_vendedor);

CREATE INDEX IF NOT EXISTS idx_ventas_diarias_vendedor_fecha
  ON ventas_diarias(id_vendedor, fecha);

CREATE INDEX IF NOT EXISTS idx_rechazos_id_vendedor
  ON rechazos(id_vendedor) WHERE id_vendedor IS NOT NULL;

-- Limpiamos las filas viejas con id_vendedor=0 que vienen del antes —
-- el backfill las va a re-poblar con el id_vendedor real.
DELETE FROM ventas_diarias WHERE id_vendedor = 0;
