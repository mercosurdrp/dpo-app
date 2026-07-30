-- Dibujo de la cubierta: liso / taco / semi taco.
--
-- Por qué hace falta: la profundidad con la que una cubierta arranca su vida NO
-- es un número fijo de la marca, depende del DIBUJO con el que se la mandó a
-- recapar — "no es lo mismo una lisa que una de taco o una semi taco, varía
-- mucho, pero mayormente vienen 15 mm" (dato del usuario, 30/07/2026). Sin este
-- campo el sistema no tiene con qué explicar por qué dos gomas de la misma marca
-- arrancan en 15 y en 16 mm, y el desgaste (inicial − actual) queda a merced de
-- lo que se haya tipeado.
--
-- Hasta hoy el dibujo se venía anotando a mano en `observaciones`, así que el
-- backfill de más abajo lo levanta de ahí.
--
-- Solo Pampeana: en Misiones no existe el módulo de neumáticos.

alter table mantenimiento_neumaticos
  add column if not exists dibujo text;

alter table mantenimiento_neumaticos
  drop constraint if exists mantenimiento_neumaticos_dibujo_check;

alter table mantenimiento_neumaticos
  add constraint mantenimiento_neumaticos_dibujo_check
  check (dibujo is null or dibujo in ('liso', 'taco', 'semi_taco'));

comment on column mantenimiento_neumaticos.dibujo is
  'Dibujo de la banda: liso | taco | semi_taco. Define con cuánta goma arranca la cubierta (sobre todo al volver de un recapado). NULL = no relevado.';

-- El recapador puede devolver la goma con un dibujo distinto del que se envió,
-- y de ese dibujo depende la profundidad de retorno: se guarda en el ítem del
-- remito para que quede el historial de con qué volvió cada vuelta.
alter table mantenimiento_recapado_items
  add column if not exists dibujo_retorno text;

alter table mantenimiento_recapado_items
  drop constraint if exists mantenimiento_recapado_items_dibujo_check;

alter table mantenimiento_recapado_items
  add constraint mantenimiento_recapado_items_dibujo_check
  check (dibujo_retorno is null or dibujo_retorno in ('liso', 'taco', 'semi_taco'));

comment on column mantenimiento_recapado_items.dibujo_retorno is
  'Dibujo con el que el recapador devolvió la cubierta (liso | taco | semi_taco). Explica la profundidad de retorno.';

-- Backfill: el dibujo que se venía anotando en observaciones pasa al campo.
-- El orden importa — "semi taco" se evalúa primero para que no lo pise "taco".
update mantenimiento_neumaticos
set dibujo = 'semi_taco'
where dibujo is null and observaciones ilike '%dibujo semi taco%';

update mantenimiento_neumaticos
set dibujo = 'taco'
where dibujo is null and observaciones ilike '%dibujo taco%';

update mantenimiento_neumaticos
set dibujo = 'liso'
where dibujo is null and observaciones ilike '%dibujo liso%';

create index if not exists mant_neu_dibujo_idx
  on mantenimiento_neumaticos (dibujo);
