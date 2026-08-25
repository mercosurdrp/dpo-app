-- De dónde salió cada medición de dibujo: alta o ronda (25/08/2026)
--
-- PROBLEMA: `mantenimiento_neumatico_mediciones` mezcla dos cosas distintas.
--
--   * El valor NOMINAL que se carga al dar de alta una cubierta (o al volver
--     del recapador): "20 mm", "12,5 mm". Nadie lo midió con calibre — es el
--     dibujo declarado del modelo.
--   * La MEDICIÓN de la ronda mensual, hecha con calibre: 4,68 / 5,15 / 10,84.
--
-- El nominal trae ~1,5–2 mm de más contra lo que después lee el calibre, y como
-- punto de arranque de un tramo mete ese offset entero en el numerador del
-- desgaste. Con eso, la misma goma daba 0,056 o 0,312 mm/1.000 km según cuán
-- vieja fuera el alta: las 33 cubiertas que tenían tasa arrancaban TODAS de un
-- nominal.
--
-- El código lo resolvió con un piso de fecha (`INICIO_MEDICIONES = 2026-07-01`,
-- porque las mediciones reales arrancan el 10/07/2026). Sirve para lo ya
-- cargado, pero no para lo que viene: un alta cargada el mes que viene también
-- va a ser nominal y va a caer del lado bueno de la fecha.
--
-- QUÉ CAMBIA: la fila dice de dónde salió. El piso de fecha se mantiene como
-- segunda barrera para el histórico.

alter table public.mantenimiento_neumatico_mediciones
  add column if not exists origen text not null default 'ronda'
    check (origen in ('alta', 'ronda'));

comment on column public.mantenimiento_neumatico_mediciones.origen is
  'alta = dibujo nominal declarado (alta de la cubierta o retorno del recapado); ronda = medido con calibre. Sólo las de ronda entran al cálculo de desgaste.';

-- Backfill: todo lo anterior al 10/07/2026 (primera ronda con calibre) es
-- nominal. Es el mismo criterio que ya aplica el código, ahora escrito en el
-- dato. Verificado sobre las 243 filas: antes de julio/2026 son números
-- redondos y repetidos por lote de alta.
update public.mantenimiento_neumatico_mediciones
set origen = 'alta'
where fecha < date '2026-07-01' and origen <> 'alta';

create index if not exists idx_neum_mediciones_origen
  on public.mantenimiento_neumatico_mediciones (neumatico_id, fecha)
  where origen = 'ronda';
