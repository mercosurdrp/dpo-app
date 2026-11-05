-- DPO Flota 3.3 «Consumo de combustible»: dos PI de pérdida que acompañan al
-- km/l (R3.3.3) y son la condición con la que se fijó la meta 3,75 el 31/08/2026
-- («0 cargas sin registrar y una carga cada ≤ 7 días por camión»).
--
--  * combustible_sin_registrar_l: litros del mes cuyo tramo rinde > 1,4× la
--    mediana del camión (ver src/lib/vehiculos/combustible-limpio.ts). Son
--    cargas que entraron al tanque sin pasar por la app. Meta 0.
--  * combustible_camiones_sin_carga_7d: camiones de reparto con algún hueco de
--    más de 7 días entre cargas dentro del mes. Un camión que no carga en una
--    semana o está parado o cargó sin registrar. Meta 0.
--
-- Mismo patrón que 20260711180000_flota_kpi_combustible_co2.sql.

INSERT INTO flota_metas (kpi, meta, comparador, unidad, justificacion) VALUES
  ('combustible_sin_registrar_l', 0, '<=', 'L',
   'PI de pérdida de combustible (DPO 3.3): litros cargados sin registrar en la app, detectados porque el tramo siguiente rinde más de 1,4× lo habitual del camión. Mientras haya cargas sin registrar el km/l está inflado y el costo por km, subestimado. Meta 0: la política de combustible exige registrar cada carga en el momento, con odómetro y ticket.'),
  ('combustible_camiones_sin_carga_7d', 0, '<=', '#',
   'Condición de la meta de km/l (fijada el 31/08/2026): una carga cada 7 días o menos por camión de reparto. Un hueco mayor es un camión parado sin avisar o una carga que no pasó por la app, y en los dos casos el rendimiento del mes deja de ser comparable. Meta 0 camiones.')
ON CONFLICT (kpi) DO UPDATE SET
  meta = EXCLUDED.meta,
  comparador = EXCLUDED.comparador,
  unidad = EXCLUDED.unidad,
  justificacion = COALESCE(flota_metas.justificacion, EXCLUDED.justificacion);
