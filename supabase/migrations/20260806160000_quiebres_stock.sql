-- =============================================
-- Quiebres de stock (Indicadores · Almacén)
--
-- Foto de la MAÑANA del stock por SKU, antes de que empiece el picking. Una
-- fila por (fecha, artículo). El indicador de quiebre se lee de acá cuando el
-- día tiene foto; los días sin foto caen al proxy de venta (un SKU de rotación
-- estable que no vende N días operativos seguidos estaba quebrado).
--
-- 🚨 El quiebre se evalúa por PRODUCTO FÍSICO (marca + calibre), no por
-- `id_articulo`: los códigos migran. La Quilmes litro retornable es el SKU
-- 7026, pero de marzo a julio 2026 se vendió como 46629 ("CLASICA RET X12 1L
-- MUND", envase Mundial) y volvió a 7026 a fin de julio. Mirado por SKU eso
-- son 6 días de quiebre del octavo producto en rotación; por familia vendió
-- los 26 días. Si el indicador mira el código, cada cambio de envase le
-- descuenta plata al comprador justo cuando hizo bien el trabajo.
--
-- `familia` se guarda desnormalizada (marca|calibre del maestro de la Railway)
-- para que la foto quede legible aunque después cambie el maestro.
-- =============================================

CREATE TABLE IF NOT EXISTS quiebres_stock_fotos (
  fecha          date NOT NULL,
  id_articulo    integer NOT NULL,
  ds_articulo    text,
  familia        text,
  bultos         numeric NOT NULL DEFAULT 0,
  dias_cobertura numeric,
  vpd            numeric,
  en_quiebre     boolean NOT NULL DEFAULT false,
  origen         text NOT NULL DEFAULT 'cobertura-live',
  captured_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, id_articulo)
);

CREATE INDEX IF NOT EXISTS quiebres_stock_fotos_fecha_idx
  ON quiebres_stock_fotos (fecha);
CREATE INDEX IF NOT EXISTS quiebres_stock_fotos_quiebre_idx
  ON quiebres_stock_fotos (fecha) WHERE en_quiebre;

ALTER TABLE quiebres_stock_fotos ENABLE ROW LEVEL SECURITY;

-- Lectura para cualquier usuario logueado; la escritura es solo del cron, que
-- entra con service role y saltea RLS. Sin policy de escritura, nadie puede
-- editar la foto a mano desde la app: es evidencia, no un formulario.
CREATE POLICY "quiebres_stock_fotos_read" ON quiebres_stock_fotos
  FOR SELECT TO authenticated USING (true);
