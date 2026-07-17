-- La meta de ahorro de una iniciativa se define como un % del PRESUPUESTO ANUAL
-- del rubro ("el presupuesto de vencidos es X, tengo que ahorrar el 70%").
--
-- Hasta ahora ese % existía pero sólo en la cabeza de quien cargaba: el ahorro
-- comprometido se tipeaba a mano, calculado como (línea base − objetivo) × 12
-- sobre el gasto REAL del año anterior. Eso trae dos problemas:
--   1) el % no se ve en ningún lado (Vencidos es 70%, Roturas 10%, y no lo dice);
--   2) la línea base está en pesos del año anterior y el presupuesto en pesos de
--      este año, así que no son comparables: el presupuesto 2026 de vencidos
--      ($1.989.417/mes) casi duplica el gasto real 2025 ($1.024.007/mes), y por
--      eso el compromiso cargado ($8,6M) quedaba a mitad del 70% real ($16,7M).
--
-- `presupuesto_rubro_anual` guarda el presupuesto usado al definir la meta (no se
-- recalcula solo): el EERR se vuelve a subir todos los meses y un compromiso
-- publicado no puede cambiar por su cuenta. Queda auditable de dónde salió el
-- monto: 16.711.101 = 70% de 23.873.002.
alter table presupuestos_iniciativas
  add column if not exists rubro text,
  add column if not exists ahorro_pct_objetivo numeric(5,2)
    check (ahorro_pct_objetivo is null
           or (ahorro_pct_objetivo > 0 and ahorro_pct_objetivo <= 100)),
  add column if not exists presupuesto_rubro_anual numeric(14,2);

comment on column presupuestos_iniciativas.rubro is
  'Rubro del EERR al que apunta la iniciativa (texto, matchea presupuesto_rubros_catalogo.rubro). NULL = iniciativa sin rubro: el ahorro comprometido se carga a mano.';
comment on column presupuestos_iniciativas.ahorro_pct_objetivo is
  '% del presupuesto anual del rubro que se compromete ahorrar. Ej. 70 = gastar sólo el 30% de lo presupuestado.';
comment on column presupuestos_iniciativas.presupuesto_rubro_anual is
  'Presupuesto anual del rubro usado para calcular la meta (snapshot, hoja "PRESUPUESTO <año> MRP" del EERR, columna TOTAL). No se recalcula solo.';
