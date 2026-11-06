-- APLICAR EN PAMPEANA — copia de supabase/migrations/20261106150000_cil_control_aceite.sql
-- Idempotente: se puede correr dos veces.

-- =============================================
-- DPO Flota 4.1 (ATO / CIL) — control de aceite estructurado (06/11/2026)
--
-- Por qué: el PI de ATO del R4.1.4 pasa a ser el ACEITE. El checklist diario de
-- liberación marcó «Nivel de aceite motor» OK en todas las respuestas de jul–nov
-- (≈2.000), mientras que en el mismo período la I del CIL (control de fluidos)
-- repuso aceite 4 veces: AE908DG 2 L y AE591EI 2,5 L (18/08), AE591EI 2 L
-- (28/09, reincidente) y OJA403 5 L (29/09). Eso es lo que el CIL anticipa y el
-- checklist no ve, pero hasta hoy quedaba como texto libre en `descripcion` y
-- no se podía contar.
--
-- Qué hace:
--   1. Columnas del control de aceite en `mantenimiento_cil`. Se cargan en la
--      fila de la I (`inspeccion`), que ya es mensual y obligatoria: NO se suma
--      una cuarta letra al ciclo (la cobertura del mes se caería de golpe sin
--      que nadie hubiera dejado de trabajar), y el CHECK de `tarea` no cambia.
--   2. `mantenimiento_id`: la OT correctiva que generó el hallazgo (R4.1.5).
--   3. Dos metas nuevas en `flota_metas` (la fila tiene que existir:
--      `updateFlotaMeta` es UPDATE-only).
--   4. Backfill de los controles de ago–oct que dicen en el texto cuántos
--      litros se agregaron. Sólo se estructura lo que está escrito: no se
--      inventa nada, y queda marcado `origen = 'backfill'`.
--
-- Todo es nullable: la app está en producción y las filas viejas siguen
-- valiendo tal cual.
-- =============================================

ALTER TABLE mantenimiento_cil
  ADD COLUMN IF NOT EXISTS aceite_nivel TEXT
    CHECK (aceite_nivel IS NULL OR aceite_nivel IN ('ok', 'bajo', 'sobre_nivel')),
  ADD COLUMN IF NOT EXISTS aceite_litros NUMERIC(5,1)
    CHECK (aceite_litros IS NULL OR (aceite_litros >= 0 AND aceite_litros <= 60)),
  ADD COLUMN IF NOT EXISTS aceite_circuito TEXT
    CHECK (aceite_circuito IS NULL OR aceite_circuito IN ('motor', 'hidraulico', 'caja', 'diferencial', 'otro')),
  ADD COLUMN IF NOT EXISTS perdida_detectada BOOLEAN,
  ADD COLUMN IF NOT EXISTS perdida_ubicacion TEXT,
  ADD COLUMN IF NOT EXISTS mantenimiento_id UUID
    REFERENCES mantenimiento_realizados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origen TEXT
    CHECK (origen IS NULL OR origen IN ('app', 'backfill'));

-- El KPI lee los hallazgos por mes: índice parcial chico, sólo filas con dato.
CREATE INDEX IF NOT EXISTS idx_mtto_cil_aceite
  ON mantenimiento_cil (fecha)
  WHERE aceite_nivel IS NOT NULL OR perdida_detectada IS NOT NULL;

-- Para generar la OT desde el hallazgo hace falta poder escribir
-- `mantenimiento_id` en la fila. Hoy la tabla sólo tiene policies de SELECT,
-- INSERT y DELETE: sin UPDATE el vínculo fallaría en silencio (RLS no da
-- error, devuelve 0 filas).
DROP POLICY IF EXISTS "mtto_cil_update" ON mantenimiento_cil;
CREATE POLICY "mtto_cil_update" ON mantenimiento_cil
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

-- ---------------------------------------------
-- Metas
-- ---------------------------------------------
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('cil_fugas_detectadas', NULL, '>=', '#',
   'PI de ATO (R4.1.4): faltantes o pérdidas de aceite que encuentra el control mensual del CIL (nivel bajo, litros repuestos o pérdida a la vista). Es un PI de monitoreo, no de volumen: cada hallazgo es una falla que no llegó a ruta. Serie estructurada desde ago/2026: ago 2 · sep 2 · oct 0. Sin meta numérica a propósito: fijar «encontrar N fugas» premiaría inventarlas. Se lee junto con fugas_aceite_ruta.'),
  ('fugas_aceite_ruta', 1, '<=', '#',
   'Resultado del ATO (R4.1.4/R4.1.5): eventos de pérdida de fluidos o de nivel de aceite NO OK que llegaron al checklist diario (reportes de la misma unidad con menos de 7 días entre sí = 1 evento, para que una misma fuga no cuente 16 veces). Serie: jun 3 · jul 1 (HELI1, aceite hidráulico, 16 reportes) · ago 1 · sep 0 · oct 1. Meta 1 por mes: lo que el CIL deja pasar tiene que ser la excepción.')
ON CONFLICT (kpi) DO NOTHING;

-- ---------------------------------------------
-- Backfill (ago–oct 2026) — sólo lo que dice el texto
-- ---------------------------------------------
UPDATE mantenimiento_cil SET aceite_nivel = 'bajo', aceite_litros = 2,   aceite_circuito = 'motor', origen = 'backfill'
  WHERE id = 'fa1a9201-d610-4381-9173-7e5825e7d788' AND aceite_nivel IS NULL; -- AE908DG 18/08 «se agregaron 2 litros»
UPDATE mantenimiento_cil SET aceite_nivel = 'bajo', aceite_litros = 2.5, aceite_circuito = 'motor', origen = 'backfill'
  WHERE id = '35e44705-b876-4a3f-96ca-8dc1960aebb5' AND aceite_nivel IS NULL; -- AE591EI 18/08 «2,5 litros»
UPDATE mantenimiento_cil SET aceite_nivel = 'ok',   aceite_litros = 0,   aceite_circuito = 'motor', origen = 'backfill'
  WHERE id = 'f74babdf-46e1-4b61-baf6-654f0b5eb869' AND aceite_nivel IS NULL; -- AF664NY 24/08 «todo bien aceite»
UPDATE mantenimiento_cil SET aceite_nivel = 'bajo', aceite_litros = 2,   aceite_circuito = 'motor', origen = 'backfill'
  WHERE id = '6c10013e-db13-4eb7-a0a2-154adeae388d' AND aceite_nivel IS NULL; -- AE591EI 28/09 «2 litros de aceite de motor»
UPDATE mantenimiento_cil SET aceite_nivel = 'bajo', aceite_litros = 5,   aceite_circuito = 'motor', origen = 'backfill'
  WHERE id = '8931c1d4-8615-4c27-8d97-ec28dbf80724' AND aceite_nivel IS NULL; -- OJA403 29/09 «5 litros de aceite de motor»
-- AF664NY 14/10 («control de niveles y de pérdidas») NO se toca: no dice el
-- resultado, y suponer «OK» sería inventar el dato.

-- ---------------------------------------------
-- Control (correr después)
-- ---------------------------------------------
-- SELECT kpi, meta, comparador FROM flota_metas WHERE kpi IN ('cil_fugas_detectadas', 'fugas_aceite_ruta');  -- 2 filas
-- SELECT to_char(fecha,'YYYY-MM') m, count(*) FILTER (WHERE aceite_nivel IN ('bajo','sobre_nivel') OR aceite_litros > 0 OR perdida_detectada) hallazgos, sum(aceite_litros) litros
--   FROM mantenimiento_cil WHERE origen = 'backfill' GROUP BY 1 ORDER BY 1;                                  -- ago 2 (4,5 L) · sep 2 (7 L)
