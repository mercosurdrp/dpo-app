-- Rubro de la orden de trabajo: separa las OT de NEUMÁTICOS del resto.
--
-- Los neumáticos se gestionan en su propia solapa (stock, diagrama, rotación,
-- alineación, balanceo, compras) y las OT que salen de ahí —o cualquier trabajo
-- de cubiertas: reparación, recapado, gomería— tienen que verse ahí, no mezcladas
-- con el mantenimiento general de la unidad.
--
-- 'general' = todo lo demás (es el default, así ninguna OT existente cambia de
-- lugar salvo las que se clasifican explícitamente en el backfill de abajo).

alter table mantenimiento_realizados
  add column if not exists rubro text not null default 'general';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mantenimiento_realizados_rubro_check'
  ) then
    alter table mantenimiento_realizados
      add constraint mantenimiento_realizados_rubro_check
      check (rubro in ('general', 'neumaticos'));
  end if;
end $$;

create index if not exists mantenimiento_realizados_rubro_idx
  on mantenimiento_realizados (rubro, fecha desc);
