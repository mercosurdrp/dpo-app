-- Radar de Rechazos: bultos rechazados históricos por cliente.
--
-- Los conteos cerrado_/sin_dinero_ pasan a medir VECES (cliente × fecha), igual
-- que el Árbol del Sueño, y no líneas de la tabla `rechazos` (que tiene una fila
-- por artículo). Como el volumen rechazado ya no se lee del conteo, se guarda
-- aparte: bultos rechazados por cerrado + sin dinero en los últimos 365 días.

alter table radar_rechazos_cliente
  add column if not exists bultos_rechazados_anio numeric not null default 0;

comment on column radar_rechazos_cliente.bultos_rechazados_anio is
  'Bultos rechazados por CERRADO + SIN DINERO en los últimos 365 días (suma de bultos_rechazados de rechazos).';

comment on column radar_rechazos_cliente.cerrado_anio is
  'VECES (cliente × fecha) con rechazo por CERRADO en los últimos 365 días. NO líneas de producto.';
comment on column radar_rechazos_cliente.sin_dinero_anio is
  'VECES (cliente × fecha) con rechazo por SIN DINERO en los últimos 365 días. NO líneas de producto.';
