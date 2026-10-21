-- =============================================
-- DPO 5.1 Plan Territorial — la HISTORIA de cada etapa de rutas
-- 21/10/2026
--
-- Sebastián pidió que lo que cuentan las presentaciones (cómo estaba, qué se
-- hizo, cómo viene, qué se espera, con los mapas) esté en la página y no sólo
-- como PPT para descargar. Cada etapa suma tres textos y una lista de
-- imágenes (ya subidas al bucket dpo-evidencia, planeamiento/5.1/historia/).
-- =============================================

ALTER TABLE territorial_rediseno_rutas
  ADD COLUMN IF NOT EXISTS antes_texto    text,
  ADD COLUMN IF NOT EXISTS cambio_texto   text,
  ADD COLUMN IF NOT EXISTS esperado_texto text,
  ADD COLUMN IF NOT EXISTS imagenes       jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN territorial_rediseno_rutas.antes_texto IS
  'Historia, parte 1: cómo se atendía la ciudad antes de esta etapa (texto libre).';
COMMENT ON COLUMN territorial_rediseno_rutas.cambio_texto IS
  'Historia, parte 2: qué se hizo y por qué. Si está vacío la página muestra justificacion.';
COMMENT ON COLUMN territorial_rediseno_rutas.esperado_texto IS
  'Historia, parte 4: qué se espera (meta, carga por día estimada, qué se mide).';
COMMENT ON COLUMN territorial_rediseno_rutas.imagenes IS
  'Mapas y gráficos de la etapa: [{path, titulo, momento}] con momento = antes | cambio | esperado. '
  'path es la clave en el bucket dpo-evidencia; la app firma la URL al leer.';
