-- ===========================================================================
-- Plan de acción por ítem del checklist de flota (DPO 1.3)
--
-- Qué hace, en dos partes:
--   1) agrega a `checklist_item_analisis` las columnas del plan de acción
--      (es un cambio de ESQUEMA, por eso va por el SQL Editor);
--   2) carga los tres planes de los ítems que más se repiten, los que se
--      decidieron en la operación y hasta hoy no estaban escritos en ningún
--      lado.
--
-- Correr entero, de una. Es idempotente: se puede volver a correr sin
-- duplicar nada. No corre apuro: si no se corre, la pantalla de Análisis por
-- ítem sigue funcionando igual y el bloque de planes simplemente no aparece.
--
-- Después de correrlo, los planes se editan desde la app:
-- /vehiculos/mantenimiento → Análisis por ítem → "Plan de acción de los ítems
-- que más fallan".
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1) Esquema
-- --------------------------------------------------------------------------
alter table checklist_item_analisis
  add column if not exists plan_accion text,
  add column if not exists plan_estado text,
  add column if not exists plan_at timestamptz,
  add column if not exists plan_by uuid references profiles(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'checklist_item_analisis_plan_estado_chk'
  ) then
    alter table checklist_item_analisis
      add constraint checklist_item_analisis_plan_estado_chk
      check (plan_estado is null or plan_estado in ('en_curso', 'cerrado'));
  end if;
end $$;

comment on column checklist_item_analisis.plan_accion is
  'DPO 1.3: contramedida de fondo sobre el ítem que se repite (no sobre la marca puntual). Ej.: cambio de marca de focos para luces de freno.';
comment on column checklist_item_analisis.plan_estado is
  'en_curso | cerrado. Null = sin plan cargado.';

-- --------------------------------------------------------------------------
-- 2) Los tres planes de los ítems más frecuentes
--
-- `plan_by` queda nulo a propósito: estos tres se cargan por SQL y no por un
-- usuario de la app. La próxima edición desde la pantalla los firma.
-- --------------------------------------------------------------------------

-- Pérdida de fluidos y/o alarmas — autoelevador (23 observaciones, HELI1/HELI2)
insert into checklist_item_analisis (item_id, plan_accion, plan_estado, plan_at, updated_at)
values (
  '63331aad-413b-4fcc-94f4-2f094d26e591',
  'No era una pérdida de la máquina: el service la había dejado con exceso de aceite hidráulico. Se trabajó el tema con la gente que vino a hacer el service, se revisó la unidad y se le retiró la cantidad de aceite de más. Las marcas son todas observación (goteo), nunca NO OK.',
  'cerrado',
  now(),
  now()
)
on conflict (item_id) do update
  set plan_accion = excluded.plan_accion,
      plan_estado = excluded.plan_estado,
      plan_at = coalesce(checklist_item_analisis.plan_at, excluded.plan_at),
      updated_at = now();

-- Cierre de lonas — camión (8 NO OK)
insert into checklist_item_analisis (item_id, plan_accion, plan_estado, plan_at, updated_at)
values (
  'ed74527f-e5d8-4fb7-9a0e-f2b3dd8ec580',
  'Se pidieron dos presupuestos para cambiar las manijas de la puerta por unas de mejor calidad. El cierre falla por la manija, así que reponerla igual repite el defecto: la contramedida es el cambio de calidad de la pieza.',
  'en_curso',
  now(),
  now()
)
on conflict (item_id) do update
  set plan_accion = excluded.plan_accion,
      plan_estado = excluded.plan_estado,
      plan_at = coalesce(checklist_item_analisis.plan_at, excluded.plan_at),
      updated_at = now();

-- Luces de frenos — camión (3 NO OK)
insert into checklist_item_analisis (item_id, plan_accion, plan_estado, plan_at, updated_at)
values (
  '388cac89-ec4d-4f9f-83b4-41ca6188547e',
  'Se cambia de marca de focos. Los que venían fallando eran de la marca anterior, así que el recambio de la misma pieza no corta la repetición.',
  'en_curso',
  now(),
  now()
)
on conflict (item_id) do update
  set plan_accion = excluded.plan_accion,
      plan_estado = excluded.plan_estado,
      plan_at = coalesce(checklist_item_analisis.plan_at, excluded.plan_at),
      updated_at = now();

-- --------------------------------------------------------------------------
-- Control: tiene que devolver las tres filas con su plan.
-- --------------------------------------------------------------------------
select ci.nombre,
       coalesce(ci.tipo_vehiculo, 'camión') as modal,
       a.plan_estado,
       a.plan_accion
  from checklist_item_analisis a
  join checklist_items ci on ci.id = a.item_id
 where a.plan_accion is not null
 order by ci.nombre;
