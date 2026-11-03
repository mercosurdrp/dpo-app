-- Análisis por ítem del checklist (DPO 1.3): el PLAN DE ACCIÓN del ítem.
--
-- La tabla ya guardaba la CONCLUSIÓN —por qué la tasa de ese ítem es la que
-- es—, pero el punto pide la otra mitad: qué se hizo. Hoy eso vive en los
-- planes de acción de cada respuesta (`checklist_planes_accion`), que son por
-- marca: arreglan el defecto del día en una unidad y no dicen nada del ítem
-- que se repite en toda la flota.
--
-- Los tres casos que lo pidieron, los ítems de mayor frecuencia:
--   · «Pérdida de fluidos y/o alarmas» del autoelevador (23 observaciones): no
--     era una pérdida de la máquina, el service la había dejado con exceso de
--     aceite hidráulico. Se trabajó con el proveedor y se le retiró el
--     excedente. Sin el plan escrito, 23 marcas se leen como pérdida crónica.
--   · «Cierre de lonas» (8 NO OK): se pidieron dos presupuestos para cambiar
--     las manijas por unas de mejor calidad. Es una compra, no una reparación,
--     y por eso no deja rastro en ninguna OT.
--   · «Luces de frenos» (3 NO OK): se cambia de marca de focos.
--
-- El plan es del ÍTEM, no de la marca: es la contramedida de fondo sobre la
-- causa que lo hace repetirse. Por eso va acá, al lado de la conclusión, y no
-- en `checklist_planes_accion`.
--
-- `plan_estado` separa el plan que sigue abierto del que ya se cerró: un plan
-- sin estado es una nota más, y el ítem que se dejó de marcar después de
-- ejecutarlo es la evidencia de que la contramedida funcionó.

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
