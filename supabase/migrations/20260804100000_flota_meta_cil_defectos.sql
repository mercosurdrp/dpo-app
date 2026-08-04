-- Meta del KPI de resultado del ATO (DPO Flota 4.1): "Defectos que el CIL
-- anticipa" — pérdida de fluidos + luces (focos y destelladores) + soldaduras
-- de carrocería, contados por mes desde el checklist.
--
-- La fila tiene que existir sí o sí: `updateFlotaMeta` sólo hace UPDATE por
-- kpi, así que sin este INSERT el botón "Editar meta" de la pantalla no tendría
-- ninguna fila que tocar y la meta no se podría cargar desde la app.
--
-- El número sale de la serie real desde que hay checklists (09/04/2026):
--   abril 1 · mayo 2 · junio 4 · julio 20 · agosto 3 (parcial al 04/08)
-- Julio es la anomalía de HELI1 —18 REGULAR de pérdida de fluidos por la tapa,
-- ya reemplazada—; sacando eso, los meses se mueven entre 1 y 4.
--
-- Se elige 3 y no 4: con 4 la meta se cumpliría sola todos los meses menos
-- julio y no le exigiría nada al CIL. Con 3 se cumple en abril, mayo y agosto,
-- y queda margen real de mejora. Tampoco se pone 2, para no repetir lo de la
-- meta YTD del PDCA de Rechazos, que quedó inalcanzable y dejó de servir.
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('cil_defectos_anticipables', 3, '<=', '#',
   'Serie desde 04/2026: abr 1, may 2, jun 4, jul 20 (anomalía de la tapa de HELI1, ya reparada), ago 3. Sin esa anomalía la flota se mueve entre 1 y 4 por mes; 3 exige mejora sin volverse inalcanzable.')
ON CONFLICT (kpi) DO UPDATE
  SET meta = EXCLUDED.meta,
      comparador = EXCLUDED.comparador,
      unidad = EXCLUDED.unidad,
      justificacion = EXCLUDED.justificacion,
      updated_at = now();
