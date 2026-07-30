-- Campos que el maestro de flota necesita para cumplir R1.1.2 del pilar Flota.
--
-- El manual pide que los equipos estén listados con: "tipo de activo, numero
-- asignado, números de serie, matricula, fabricante, Año/modelo, Kms u horas,
-- capacidad (tara y carga), ubicación actual de la flota, unidad de telemetría,
-- estado de la documentación". La ficha tenía casi todo salvo estos tres:
--
--  * numero_asignado — el número interno con el que la operación llama a la
--    unidad (el "camión 7"), distinto de la patente.
--  * tara_kg — el manual pide capacidad "(tara y carga)"; sólo estaba la carga.
--  * telemetria — qué unidad de telemetría/GPS tiene montada. R1.2.5 además
--    exige recopilar datos de telemetría de repartos y autoelevadores, así que
--    el maestro tiene que poder decir cuáles la tienen y cuáles no.
--
-- Las horas (kms U HORAS) no son un campo: el horómetro de los autoelevadores
-- ya se lee de las lecturas, igual que el odómetro de los camiones.
--
-- Solo Pampeana.

alter table vehiculos_ficha
  add column if not exists numero_asignado text,
  add column if not exists tara_kg numeric,
  add column if not exists telemetria text;

comment on column vehiculos_ficha.numero_asignado is
  'Número interno de la unidad en la operación (R1.1.2 "numero asignado"), distinto de la patente.';
comment on column vehiculos_ficha.tara_kg is
  'Tara en kg. R1.1.2 pide capacidad como "tara y carga"; la carga va en capacidad_carga.';
comment on column vehiculos_ficha.telemetria is
  'Unidad de telemetría / GPS montada en el vehículo (R1.1.2 y R1.2.5). NULL = sin relevar.';
