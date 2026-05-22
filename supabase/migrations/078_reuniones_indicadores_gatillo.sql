-- 078_reuniones_indicadores_gatillo.sql
-- Agrega a la config de indicadores de reunión:
--   * gatillo  → umbral de alarma. Cuando el valor cruza el gatillo hacia el
--     lado "malo" (según mejor_si), la celda entra en zona ROJA y el indicador
--     debe analizarse con herramientas de gestión (mejora continua).
--   * mejor_si → polaridad del indicador: 'mayor' (más es mejor, la meta es
--     piso) o 'menor' (menos es mejor, la meta es techo). Habilita el coloreo
--     por target/semáforo también para los indicadores de carga manual (hasta
--     ahora solo las filas auto tenían polaridad, definida en código).
--
-- Semáforo resultante (con meta M, gatillo G, polaridad p):
--   mayor: v>=M verde · G<=v<M amarillo · v<G rojo+♻
--   menor: v<=M verde · M<v<=G amarillo · v>G rojo+♻
--   (sin gatillo: solo verde/rojo por meta, sin ♻)
--
-- Idempotente: se puede correr más de una vez sin error.

ALTER TABLE reuniones_indicadores_config
  ADD COLUMN IF NOT EXISTS gatillo numeric(14, 2),
  ADD COLUMN IF NOT EXISTS mejor_si text;

ALTER TABLE reuniones_indicadores_config
  DROP CONSTRAINT IF EXISTS reuniones_indicadores_config_mejor_si_chk;
ALTER TABLE reuniones_indicadores_config
  ADD CONSTRAINT reuniones_indicadores_config_mejor_si_chk
  CHECK (mejor_si IS NULL OR mejor_si IN ('mayor', 'menor'));
