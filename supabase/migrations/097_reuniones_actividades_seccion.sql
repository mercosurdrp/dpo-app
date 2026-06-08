-- =============================================
-- Reuniones · Action Log por sección
-- Etiqueta cada actividad del action log con la sección/indicador del que se
-- habló (ej. 'rechazos', 'sci', 'nps'...). NULL = action log general (temas
-- fuera de las secciones). Usado por la Reunión Ventas-Logística.
-- =============================================

ALTER TABLE reuniones_actividades
  ADD COLUMN IF NOT EXISTS seccion text;

COMMENT ON COLUMN reuniones_actividades.seccion IS
  'Sección/indicador de la reunión al que pertenece el compromiso (ej. rechazos, sci, nps...). NULL = action log general (temas fuera de secciones).';
