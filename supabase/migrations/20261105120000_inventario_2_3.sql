-- DPO Flota 2.3 — Políticas y gestión de piezas de inventario (H1: 1/5).
--
-- Lo que el auditor verifica y la base todavía no podía responder:
--   R2.3.2  "control de stock mínimo, OBJETIVO y MÁXIMO, cómo se definieron las
--           agrupaciones (FUERA, SOBRE, CURVA ABC) y si se actualizan con las
--           salidas" → precio, proveedor, lead time, parada por falta de pieza y
--           la fecha en que se adoptó la política sugerida por el consumo.
--   R2.3.2  conteo físico: cada diferencia con su CAUSA, y el ajuste como
--           movimiento (el SOP dice que el stock nunca se edita a mano).
--   R2.3.3  KPI de inventario por impacto: capital inmovilizado (valor del
--           pañol), pedidos demorados por piezas, cumplimiento del mínimo.
--   R2.3.1a/R2.3.2a  proveedores de piezas con datos y ANS: razón social, CUIT,
--           contacto, tipo de vehículo, lead time acordado.
--
-- Misma migración que APLICAR_EN_PAMPEANA_INVENTARIO_2_3.sql (ambos tenants). Idempotente.

-- 1) Maestro de repuestos -----------------------------------------------------
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES mantenimiento_proveedores(id) ON DELETE SET NULL;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS lead_time_dias INT;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS parada_por_falta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS politica_actualizada_at TIMESTAMPTZ;
ALTER TABLE mantenimiento_repuestos ADD COLUMN IF NOT EXISTS politica_actualizada_por UUID;

COMMENT ON COLUMN mantenimiento_repuestos.precio_unitario IS 'Último costo unitario conocido. stock_actual × precio = capital inmovilizado (KPI valor_stock_panol).';
COMMENT ON COLUMN mantenimiento_repuestos.lead_time_dias IS 'Días que tarda la reposición con el proveedor habitual. Entra en la criticidad (matriz de la planilla DPO 2.3).';
COMMENT ON COLUMN mantenimiento_repuestos.parada_por_falta IS 'true = alguna vez una unidad quedó parada por faltar esta pieza. Entra en la criticidad.';
COMMENT ON COLUMN mantenimiento_repuestos.politica_actualizada_at IS 'Última vez que se adoptó (o revisó a mano) la política de stock sugerida por el consumo (R2.3.2: "se actualizan en función de las salidas").';

-- 2) Conteo físico: causa de cada diferencia + ajuste como movimiento --------
ALTER TABLE mantenimiento_conteo_items ADD COLUMN IF NOT EXISTS causa TEXT;
ALTER TABLE mantenimiento_conteo_items ADD COLUMN IF NOT EXISTS nota TEXT;
ALTER TABLE mantenimiento_conteo_items ADD COLUMN IF NOT EXISTS movimiento_id UUID REFERENCES mantenimiento_repuestos_movimientos(id) ON DELETE SET NULL;

ALTER TABLE mantenimiento_conteo_items DROP CONSTRAINT IF EXISTS mtto_conteo_items_causa_check;
ALTER TABLE mantenimiento_conteo_items ADD CONSTRAINT mtto_conteo_items_causa_check
  CHECK (causa IS NULL OR causa IN ('egreso_no_registrado', 'ingreso_no_registrado', 'error_conteo', 'rotura_perdida', 'otro'));

-- El conteo ya podía insertar ítems; ahora también los actualiza (causa) y la
-- app registra el ajuste con la función registrar_movimiento_repuesto.
DROP POLICY IF EXISTS "mtto_conteo_items_update" ON mantenimiento_conteo_items;
CREATE POLICY "mtto_conteo_items_update" ON mantenimiento_conteo_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3) Proveedores de piezas con datos (R2.3.1a / planilla "Listado de Proveedores")
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS razon_social TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS cuit TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS localidad TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS tipo_vehiculo TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS es_repuestos BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS es_taller BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS lead_time_dias INT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE mantenimiento_proveedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Los que ya aparecen como proveedor de un pedido de repuestos quedan marcados.
UPDATE mantenimiento_proveedores p SET es_repuestos = true
  WHERE EXISTS (SELECT 1 FROM mantenimiento_pedidos pe WHERE lower(trim(pe.proveedor)) = lower(trim(p.nombre)));
UPDATE mantenimiento_proveedores p SET es_taller = true
  WHERE EXISTS (SELECT 1 FROM mantenimiento_realizados m WHERE lower(trim(m.taller)) = lower(trim(p.nombre)));

DROP POLICY IF EXISTS mtto_proveedores_update ON mantenimiento_proveedores;
CREATE POLICY mtto_proveedores_update ON mantenimiento_proveedores
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE mantenimiento_pedidos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES mantenimiento_proveedores(id) ON DELETE SET NULL;

-- 4) KPIs de inventario (R2.3.3) -------------------------------------------------
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('repuestos_stock_minimo', 95, '>=', '%',
   'De los ítems del pañol con mínimo definido, cuántos están en o por encima del mínimo en el último conteo del mes. Es el indicador de FUERA de la planilla DPO 2.3: un ítem bajo el mínimo es una compra de urgencia o una unidad esperando la pieza. El 95 % admite un ítem en reposición sobre los 21 del pañol; por debajo se abre plan de acción con causa raíz. Los ítems sin mínimo no entran: definir el mínimo es parte del alta (SOP 7.1).'),
  ('repuestos_demora_pieza', 7, '<=', 'días',
   'Días promedio que un pedido de repuestos espera la pieza, de la detección de la falta al retiro (mantenimiento_pedidos). Es el "pedidos de servicio retrasados debido a las piezas" que el auditor nombra en R2.3.3 y lo que el pañol existe para evitar. 7 días es el lead time acordado con los proveedores locales en los ANS; un pedido que lo supera queda marcado en la solapa Pedidos.'),
  ('valor_stock_panol', NULL, '<=', '$',
   'Capital inmovilizado en el pañol: stock actual × último precio unitario de cada ítem. Es el primer KPI que el auditor nombra en R2.3.3 (capital circulante). Sin meta a propósito: el pañol es chico (focos, micas, relays, carros de lona) y lo que se controla es que no crezca sin consumo detrás: por eso va junto a SOBRE (ítems por encima del máximo). Se revisa en cada recuento mensual.')
ON CONFLICT (kpi) DO NOTHING;

-- Trazabilidad: fórmula nueva (decisión 04/11/2026). Mide la disciplina de
-- registro y no el mix de compras del mes: de los egresos del pañol, cuántos
-- nacieron de una OT o de un plan de acción del checklist (descuento automático)
-- en vez de cargarse a mano. Meta 100 %: todo lo que sale del pañol sale contra
-- un trabajo. Quedan afuera los ajustes por conteo.
UPDATE flota_metas SET
  meta = 100,
  justificacion = 'R2.3.2 pide trazabilidad de la pieza al trabajo y del trabajo a la unidad. El indicador mide eso y nada más: de los egresos del pañol del mes (mantenimiento_repuestos_movimientos, sin los ajustes por conteo), cuántos se generaron desde una OT o desde el plan de acción de un ítem del checklist, que son los dos caminos que dejan el movimiento atado al trabajo y a la unidad. El resto son egresos cargados a mano ("cambio de foco en AE908DH, hecho en casa"), que descuentan stock pero no dicen contra qué trabajo. Meta 100 % porque el SOP 4.2 dice que el egreso nunca se carga a mano. Línea de base: agosto 2026 0 % (9 egresos manuales), septiembre 100 % (5 de 5 por OT), octubre 0 % (4 manuales). La fórmula anterior (filas de repuesto de OT vinculadas ÷ todas las filas de repuesto de OT) se movía con cuántas piezas compraba el taller ese mes y tenía meta 25 %; se cambió el 04/11/2026.'
  WHERE kpi = 'repuestos_trazabilidad';

-- Verificación
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'mantenimiento_repuestos'
     AND column_name IN ('precio_unitario','proveedor_id','lead_time_dias','parada_por_falta','politica_actualizada_at')) AS repuestos_5,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'mantenimiento_conteo_items'
     AND column_name IN ('causa','nota','movimiento_id')) AS conteo_items_3,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'mantenimiento_proveedores'
     AND column_name IN ('razon_social','cuit','telefono','email','localidad','tipo_vehiculo','es_repuestos','es_taller','lead_time_dias')) AS proveedores_9,
  (SELECT count(*) FROM flota_metas WHERE kpi IN ('repuestos_stock_minimo','repuestos_demora_pieza','valor_stock_panol','repuestos_trazabilidad')) AS metas_4,
  (SELECT count(*) FROM mantenimiento_proveedores WHERE es_repuestos) AS prov_repuestos,
  (SELECT count(*) FROM mantenimiento_proveedores WHERE es_taller) AS prov_taller;
