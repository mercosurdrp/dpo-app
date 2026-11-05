-- Gasto de neumáticos por 1.000 km (DPO Flota 3.4 / R3.4.4).
--
-- Lo pidió el auditor en la devolución del H1 2026, con estas palabras:
-- "Buen seguimiento por la herramienta. Poseen marca de fuego. Medicion de mm
--  y calibracion mensual. Comenzar a seguir KPI de consumo de neumaticos.
--  Realizar SOP."
--
-- R3.4.4 nombra cuatro PI válidos para el punto —Presión, Medición, Gasto de
-- Neumáticos y Falla Prematura— y de los cuatro el único que no se seguía era
-- el gasto: presión y medición ya tienen sus dos indicadores desde julio 2026.
--
-- Se mide ACUMULADO DEL AÑO (plata acumulada ÷ km acumulados × 1.000) porque
-- las cubiertas se compran por juego: mes a mes el indicador daría $0 los meses
-- sin compra y un pico de $120.000 el mes que se compra un juego, y la guía del
-- punto pide tendencia contra la línea de base de los últimos 3 meses.
--
-- La meta va NULL a propósito: `updateFlotaMeta` es UPDATE-only (la fila tiene
-- que existir) y el número es decisión de la operación. Sale de la línea de
-- neumáticos del presupuesto 2027 ÷ km proyectados, no de un redondeo: el PxQ
-- 2026 presupuestaba la cubierta nueva a $760.945 y el recapado a $329.743
-- cuando lo que de verdad se pagó en 2026 fue $461.983 y $152.066.

INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('neumaticos_gasto_km', NULL, '<=', '$/1.000 km',
   'R3.4.4 pide seguir un KPI de consumo de neumáticos y nombra el Gasto de Neumáticos como uno de los válidos; es el que faltaba. El gasto crudo no sirve de indicador porque sube con los kilómetros recorridos: normalizado por km, dice cuánta plata de goma cuesta mover la flota. Numerador: cubiertas nuevas al costo de factura más el costo de los recapados, acumulado del año (las dos fuentes del panel "Costo de neumáticos por unidad"). Denominador: km de la flota de ruta del mismo tramo, la misma fuente que el km/l. Los autoelevadores quedan afuera porque miden horas. A COMPLETAR: la meta sale de la línea de neumáticos del presupuesto 2027 dividida por los km proyectados.')
ON CONFLICT (kpi) DO NOTHING;
