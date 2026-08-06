-- =============================================
-- Quiebres de Stock — comentario por producto y mes
--
-- El quiebre en sí ya no se discute: está el saldo de Chess día por día. Lo
-- que hay que registrar es POR QUÉ, y eso no sale de ningún sistema — lo sabe
-- quien compra. Ejemplos reales de julio 2026: la Stella OW 710 no se vende
-- (no debería estar en el universo), y el Pepsi 3L y el 7UP 3L no había en
-- fábrica (no es imputable al comprador).
--
-- `no_imputable` es el campo que después define el variable: separa el quiebre
-- que el comprador podía evitar del que no. Sin esto, el indicador le cobra
-- igual una falta de asignación de fábrica que un pedido tardío.
--
-- La clave es (familia, año, mes) y no la ventana de quiebre: las ventanas se
-- mueven si cambia la regla de conteo, el producto y el mes no.
-- =============================================

CREATE TABLE IF NOT EXISTS quiebres_stock_comentarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia       text NOT NULL,
  anio          integer NOT NULL,
  mes           integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  comentario    text NOT NULL DEFAULT '',
  /** true = el quiebre no es responsabilidad del comprador (ej: sin asignación de fábrica). */
  no_imputable  boolean NOT NULL DEFAULT false,
  autor         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (familia, anio, mes)
);

CREATE INDEX IF NOT EXISTS quiebres_stock_comentarios_mes_idx
  ON quiebres_stock_comentarios (anio, mes);

CREATE TRIGGER trg_quiebres_stock_comentarios_updated_at
  BEFORE UPDATE ON quiebres_stock_comentarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE quiebres_stock_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiebres_coment_read" ON quiebres_stock_comentarios
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "quiebres_coment_write" ON quiebres_stock_comentarios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));
