-- =============================================
-- Corrección de 4 indicadores del tablero de Flota (/vehiculos/mantenimiento)
-- Auditoría del 12/08/2026 recalculando cada KPI contra la base.
--
-- Sólo toca `flota_metas`: los otros tres arreglos son de cálculo y viven en el
-- código (`getFlotaKpiSeriesExtra` y `cumplimientoPlanDesdeEstados`).
-- =============================================

-- 1) NUEVO PI: medición de neumáticos (DPO 3.4)
--
-- "Conformidad de neumáticos" mezclaba dos cosas: dividía las cubiertas
-- conformes por las INSTALADAS, así que una cubierta sin medir contaba igual
-- que una gastada. El tablero mostraba 6 % en rojo en agosto de 2026 cuando las
-- 98 mediciones de los tres meses habían dado TODAS dentro de estándar: el rojo
-- era la rutina de medición sin hacer, no el estado de las cubiertas.
--
-- Partido en dos, cada número tiene un dueño: medir es de quien mide, la
-- conformidad es de mantenimiento.
--
-- Meta 90 % y no 100 %: el universo son las 85 cubiertas de camiones y
-- autoelevadores activos, y una unidad en taller todo el mes (el AF469UR son 7
-- cubiertas, 8 % del padrón) haría inalcanzable el 100 % sin que nadie hubiera
-- dejado de medir. La serie real —2,4 · 7,1 · 2,4 · 9,4 · 62,4 · 8,2 % de marzo
-- a agosto— muestra que ni siquiera el mejor mes llegó: es una meta exigente,
-- que es justamente el punto.
INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('neumaticos_medicion', 90, '>=', '%',
   'La conformidad de las cubiertas sólo se puede afirmar sobre lo que se midió. Este PI mide la rutina mensual de DPO 3.4 (profundidad y presión de todas las cubiertas de camiones y autoelevadores) y deja que "Conformidad de neumáticos" hable del estado real de la flota. 90 % deja margen para una unidad en taller todo el mes.')
ON CONFLICT (kpi) DO UPDATE
  SET meta = EXCLUDED.meta,
      comparador = EXCLUDED.comparador,
      unidad = EXCLUDED.unidad,
      justificacion = EXCLUDED.justificacion,
      updated_at = now();

-- 2) Conformidad de neumáticos: la meta 95 % no cambia, pero ahora se mide
-- sobre las cubiertas MEDIDAS. Se actualiza la justificación para que el
-- auditor no lea la vieja (que hablaba del universo instalado).
UPDATE flota_metas SET
  justificacion = 'De las cubiertas medidas en el mes, las que están dentro de estándar (≥3 mm y 90-120 psi). Presión y profundidad fuera de norma suben el consumo, generan fallas prematuras y riesgo. Se lee SIEMPRE junto con "Medición de neumáticos": 100 % sobre 7 cubiertas de 85 no dice nada de la flota.',
  updated_at = now()
WHERE kpi = 'neumaticos_conformidad';

-- 3) Defectos que el CIL anticipa: la meta se rehace porque la serie sobre la
-- que se fijó estaba contaminada.
--
-- El KPI contaba los autoelevadores del depósito. Julio de 2026 marcaba 20
-- defectos y 16 eran la MISMA pérdida de fluidos del HELI1 re-marcada día a día
-- hasta que se cambió la tapa: el indicador de la flota de REPARTO lo fijaba un
-- equipo que no sale a la calle. Con `esFlotaDeRuta` aplicado —el mismo filtro
-- que ya usan combustible y días parado— la serie real es:
--   abr 1 · may 2 · jun 0 · jul 4 · ago 1 (parcial al 13/08)
--
-- Con la serie limpia, ≤3 se cumple sola en 4 de 5 meses y no le exige nada al
-- CIL. Se baja a 2: se cumple en abril, mayo, junio y agosto, y deja a julio
-- fuera de meta, que es el mes que efectivamente tuvo un problema. No se pone 1
-- ni 0 para no repetir lo de la meta YTD del PDCA de Rechazos, que quedó
-- inalcanzable y dejó de servir.
UPDATE flota_metas SET
  meta = 2,
  justificacion = 'Serie de la FLOTA DE REPARTO (sin autoelevadores de depósito): abr 1, may 2, jun 0, jul 4, ago 1. La meta anterior de 3 se fijó sobre la serie que incluía al HELI1 —16 de los 20 defectos de julio eran la misma pérdida de fluidos re-marcada día a día—. Con la serie limpia, 2 exige mejora sobre julio sin volverse inalcanzable (junio cerró en 0).',
  updated_at = now()
WHERE kpi = 'cil_defectos_anticipables';

-- 4) Resolución de defectos de checklist: la meta ≤7 días se mantiene; cambia
-- lo que se mide.
--
-- Antes era `updated_at - created_at` del plan de acción, o sea el tiempo que el
-- PLAN estuvo abierto. En agosto de 2026, 21 de 22 planes se cargaron ya
-- resueltos en la misma sesión (11/08 15:10) y aportaban 0 días cada uno: el PI
-- daba 1,0 d en verde mientras el único defecto con seguimiento real llevaba
-- semanas. Ahora el reloj arranca en la carga del checklist (la observación del
-- chofer) y se detiene en `resuelto_at`, igual que la pantalla de focos.
-- Con eso los tres meses pasan de "0,0 · — · 1,0 d" a "31,0 · 1,0 · 13,4 d".
UPDATE flota_metas SET
  justificacion = 'Días entre que el chofer observa el defecto en el checklist y que mantenimiento cierra el plan. El reloj arranca en la observación y no en el alta del plan: cargar un plan ya resuelto dejaba el indicador en 0 días y ocultaba los defectos que estuvieron semanas abiertos. 7 días es el plazo para que un defecto no crítico no derive en correctivo.',
  updated_at = now()
WHERE kpi = 'checklist_resolucion';

-- 5) Cumplimiento del plan preventivo: la meta 90 % no cambia. El arreglo es de
-- lectura y va en el código — el KPI mostraba 100 % en verde calculado sobre 13
-- de 122 celdas plan×unidad (1 de 8 por camión; los dos autoelevadores, 0 de
-- 12), porque las tareas sin registro quedan fuera del denominador. Ahora la
-- tarjeta muestra el n y por debajo del 60 % de cobertura se queda sin semáforo.
UPDATE flota_metas SET
  justificacion = 'Tareas del plan preventivo al día sobre las que tienen algún registro. 🚨 Se lee con el n al lado: una tarea que nunca se cargó no entra en el denominador, así que con poca cobertura el porcentaje habla de un puñado de tareas y no del plan. Por debajo del 60 % de cobertura el indicador se muestra sin semáforo.',
  updated_at = now()
WHERE kpi = 'cumplimiento_plan';
