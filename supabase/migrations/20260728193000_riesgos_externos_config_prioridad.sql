-- Riesgos Externos — configuración por riesgo: cuáles son prioritarios y su criticidad.
-- Los prioritarios (corte de luz, internet y sistema/WMS) los definió el usuario; la
-- criticidad sale de la matriz de la PPT del punto DPO Planeamiento 2.2.
-- La app los muestra en una tarjeta destacada arriba del directorio "A quién llamar".

create table if not exists riesgos_externos_config (
  tipo_riesgo text primary key,
  prioritario boolean not null default false,
  criticidad text check (criticidad in ('critico', 'alto', 'medio')),
  nota text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

drop trigger if exists riesgos_externos_config_updated_at on riesgos_externos_config;
create trigger riesgos_externos_config_updated_at
  before update on riesgos_externos_config
  for each row execute function update_updated_at();

alter table riesgos_externos_config enable row level security;

drop policy if exists riesgos_externos_config_select_auth on riesgos_externos_config;
create policy riesgos_externos_config_select_auth
  on riesgos_externos_config for select using (true);

drop policy if exists riesgos_externos_config_write_editors on riesgos_externos_config;
create policy riesgos_externos_config_write_editors
  on riesgos_externos_config for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (
          array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]
        )
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (
          array['admin'::user_role, 'supervisor'::user_role, 'admin_rrhh'::user_role]
        )
    )
  );

insert into riesgos_externos_config (tipo_riesgo, prioritario, criticidad, nota) values
  ('corte_de_luz', true, 'critico', 'Riesgo prioritario del CD.'),
  ('corte_de_internet', true, 'alto', 'Riesgo prioritario del CD.'),
  ('corte_de_sistema', true, 'critico', 'Riesgo prioritario del CD.'),
  ('falla_en_generador', false, 'alto', null),
  ('corte_de_ruta_o_acceso', false, 'alto', null),
  ('incendio', false, 'alto', null),
  ('paro_sindical', false, 'critico', null),
  ('emergencia_medica_interna', false, 'critico', null),
  ('emergencia_medica_externa', false, 'critico', null),
  ('robo_warehouse', false, 'alto', null),
  ('robo_distribucion', false, 'alto', null),
  ('clausura_del_predio', false, 'critico', null),
  ('pandemia', false, 'critico', null)
on conflict (tipo_riesgo) do nothing;
