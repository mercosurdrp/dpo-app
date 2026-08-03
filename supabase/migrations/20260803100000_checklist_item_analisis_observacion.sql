-- Checklist de Flota (DPO 1.3): la conclusión escrita de cada ítem del análisis.
--
-- El análisis por ítem ya deja a la vista QUÉ falla y DÓNDE se repite, pero el
-- número solo no cierra el punto: el auditor pregunta por el ítem con miles de
-- evaluaciones y cero hallazgos, y por el que falla el 33 % de las veces. La
-- respuesta hoy vive en la cabeza del Gestor de Flota y se vuelve a explicar en
-- cada reunión.
--
-- Casos que quedaron sin registrar y son justamente los que hay que contestar:
--   · los 21 REGULAR de fluidos (18 en HELI1) eran la gotita por la tapa, ya
--     cambiada — no eran defectos, y sin la nota se vuelven a leer como defecto
--     crónico crítico;
--   · documentación nunca detecta nada porque el chofer no puede verificar un
--     vencimiento: lo controla el sistema con alertas. Es explicación válida,
--     pero hoy no está escrita en ningún lado.
--
-- Va en tabla aparte y no como columna de `checklist_items` porque son cosas
-- distintas: `descripcion` es el criterio que lee el chofer al completar el
-- check (qué se considera NO OK), y esto es la conclusión del análisis. Mezclarlas
-- haría que editar una nota de auditoría cambie lo que ve el chofer en la calle.

create table if not exists checklist_item_analisis (
  item_id uuid primary key references checklist_items(id) on delete cascade,
  observacion text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

comment on table checklist_item_analisis is
  'DPO 1.3: conclusión del análisis por ítem del checklist. Distinta de checklist_items.descripcion, que es el criterio operativo que lee el chofer.';

drop trigger if exists checklist_item_analisis_updated_at on checklist_item_analisis;
create trigger checklist_item_analisis_updated_at
  before update on checklist_item_analisis
  for each row execute function update_updated_at();

alter table checklist_item_analisis enable row level security;

drop policy if exists checklist_item_analisis_select_auth on checklist_item_analisis;
create policy checklist_item_analisis_select_auth
  on checklist_item_analisis for select using (true);

drop policy if exists checklist_item_analisis_write_editors on checklist_item_analisis;
create policy checklist_item_analisis_write_editors
  on checklist_item_analisis for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (
          array['admin'::user_role, 'supervisor'::user_role]
        )
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (
          array['admin'::user_role, 'supervisor'::user_role]
        )
    )
  );
