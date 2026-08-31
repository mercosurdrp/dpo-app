-- =============================================================================
-- TML: choferes excluidos del indicador
-- =============================================================================
-- Problema: CERBIN ADRIAN llega y sale ANTES de las 07:00 (06:20–06:57 casi
-- todos los días). Cae en la franja de las 06:00 y le queda un TML de 40–57
-- min que no es demora de liberación: es que arranca más temprano. En agosto
-- de 2026 el TML de la flota daba 26 min con él y 24 sin él (meta 25).
--
-- Solución: una lista de choferes excluidos + un trigger que deja
-- `tml_minutos` en NULL en sus egresos desde la fecha de exclusión. Todos los
-- cálculos del TML (kpis, matinal, planes, reuniones, cuadro mensual) ya
-- filtran `tml_minutos IS NOT NULL`, así que no hay que tocar ninguno. El
-- egreso sigue existiendo: el chofer sigue contando para camiones, FTE,
-- atribución de bultos/rechazos y la salida del día.
--
-- Volver a incluir: `tml_set_exclusion(chofer, false)` recalcula el TML de
-- los egresos afectados con la misma fórmula de `lib/tml/calculo.ts`
-- (max(0, hora − hora_entrada×60); franja 6 si salió antes de las 07:00).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tml_choferes_excluidos (
  chofer TEXT PRIMARY KEY,                 -- tal cual en registros_vehiculos (mayúsculas)
  desde DATE NOT NULL DEFAULT CURRENT_DATE, -- egresos con fecha >= desde no computan TML
  motivo TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tml_choferes_excluidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read tml_choferes_excluidos" ON tml_choferes_excluidos;
CREATE POLICY "Authenticated can read tml_choferes_excluidos"
  ON tml_choferes_excluidos FOR SELECT TO authenticated USING (true);
-- Escritura sólo vía tml_set_exclusion (SECURITY DEFINER, valida rol).

-- ── Trigger: egreso de un chofer excluido → tml_minutos NULL ─────────────────
CREATE OR REPLACE FUNCTION tml_anular_si_excluido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'egreso' AND EXISTS (
    SELECT 1 FROM tml_choferes_excluidos e
    WHERE e.chofer = upper(trim(NEW.chofer)) AND NEW.fecha >= e.desde
  ) THEN
    NEW.tml_minutos := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tml_anular_si_excluido ON registros_vehiculos;
CREATE TRIGGER trg_tml_anular_si_excluido
  BEFORE INSERT OR UPDATE OF chofer, hora, hora_entrada, tml_minutos, fecha, tipo
  ON registros_vehiculos
  FOR EACH ROW EXECUTE FUNCTION tml_anular_si_excluido();

-- ── Excluir / volver a incluir, con backfill ─────────────────────────────────
CREATE OR REPLACE FUNCTION tml_set_exclusion(
  p_chofer TEXT,
  p_excluir BOOLEAN,
  p_motivo TEXT DEFAULT NULL,
  p_desde DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chofer TEXT := upper(trim(p_chofer));
  v_desde DATE;
  v_n INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Sólo admin o supervisor pueden excluir choferes del TML';
  END IF;

  IF p_excluir THEN
    INSERT INTO tml_choferes_excluidos (chofer, desde, motivo, created_by)
    VALUES (v_chofer, p_desde, p_motivo, auth.uid())
    ON CONFLICT (chofer) DO UPDATE
      SET desde = EXCLUDED.desde, motivo = EXCLUDED.motivo, created_by = EXCLUDED.created_by, created_at = now();
    UPDATE registros_vehiculos
      SET tml_minutos = NULL
      WHERE tipo = 'egreso' AND upper(trim(chofer)) = v_chofer AND fecha >= p_desde
        AND tml_minutos IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    SELECT desde INTO v_desde FROM tml_choferes_excluidos WHERE chofer = v_chofer;
    DELETE FROM tml_choferes_excluidos WHERE chofer = v_chofer;
    IF v_desde IS NOT NULL THEN
      -- Misma fórmula que calcTml + franjaPorHoraSalida (lib/tml/calculo.ts).
      UPDATE registros_vehiculos
        SET tml_minutos = GREATEST(
          0,
          EXTRACT(HOUR FROM hora)::int * 60 + EXTRACT(MINUTE FROM hora)::int
            - COALESCE(hora_entrada, CASE WHEN EXTRACT(HOUR FROM hora) < 7 THEN 6 ELSE 7 END) * 60
        )
        WHERE tipo = 'egreso' AND upper(trim(chofer)) = v_chofer AND fecha >= v_desde
          AND tml_minutos IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
  END IF;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION tml_set_exclusion(TEXT, BOOLEAN, TEXT, DATE) TO authenticated;
