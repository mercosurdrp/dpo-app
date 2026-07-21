-- 20260721200000_pc_incentivos_multiples_programas.sql
--
-- R3.4.4 del manual DPO 2026 (3.4 Períodos Críticos) pide dos cosas que el
-- modelo actual no puede representar:
--
--   1. "El incentivo de temporada alta se debe diferenciar al del resto del año"
--      → pc_incentivos_programa es SINGLETON (check id = 1): sólo existe un
--        programa, así que no hay con qué contrastar.
--   2. "KPIs definidos ... conectado a indicadores (rechazos, ausentismo,
--      productividad, seguridad, presentismo)"
--      → hoy sólo hay un booleano `cumplio` que no dice CUÁLES son los KPIs ni
--        con qué meta. Quedaban escritos en prosa dentro de `descripcion`.
--
-- Se saca el singleton (un programa por año y temporada) y los KPIs pasan a ser
-- filas con meta propia, distinguiendo habilitante de puntaje: el habilitante
-- no suma, pero sin cumplirlo no se cobra (así la seguridad nunca compite
-- contra la productividad — no debe poder ganarse más apurando una carga).

-- ── 1. Un programa por (año, temporada) ────────────────────────────────────
alter table pc_incentivos_programa
  drop constraint if exists pc_incentivos_programa_singleton;

create sequence if not exists pc_incentivos_programa_id_seq owned by pc_incentivos_programa.id;
select setval('pc_incentivos_programa_id_seq',
              greatest(coalesce((select max(id) from pc_incentivos_programa), 1), 1));
alter table pc_incentivos_programa
  alter column id set default nextval('pc_incentivos_programa_id_seq');

alter table pc_incentivos_programa
  add column if not exists anio            integer,
  add column if not exists temporada       text,
  add column if not exists vigencia_desde  date,
  add column if not exists vigencia_hasta  date;

-- El programa que ya existía es el de verano: se lo etiqueta antes de exigir
-- los campos, si no la constraint fallaría sobre la fila vieja.
update pc_incentivos_programa
   set anio = coalesce(anio, 2026),
       temporada = coalesce(temporada, 'alta')
 where id = 1;

alter table pc_incentivos_programa
  alter column anio set not null,
  alter column temporada set not null,
  alter column temporada set default 'alta';

alter table pc_incentivos_programa
  drop constraint if exists pc_incentivos_programa_temporada_check;
alter table pc_incentivos_programa
  add constraint pc_incentivos_programa_temporada_check
  check (temporada in ('alta', 'resto'));

create unique index if not exists uq_pc_incentivos_programa_anio_temporada
  on pc_incentivos_programa (anio, temporada);

-- ── 2. KPIs del programa ───────────────────────────────────────────────────
create table if not exists pc_incentivos_kpis (
  id           uuid primary key default gen_random_uuid(),
  programa_id  integer not null references pc_incentivos_programa(id) on delete cascade,
  -- 'Entrega' | 'Almacén' | 'Todos' (los habilitantes suelen aplicar a todos)
  ambito       text not null default 'Todos',
  nombre       text not null,
  -- habilitante = no puntúa, pero sin cumplirlo no se cobra; puntaje = compite.
  tipo         text not null default 'puntaje' check (tipo in ('habilitante', 'puntaje')),
  meta         text not null default '',
  -- De dónde sale el número, para que sea auditable y nadie lo cargue a mano.
  fuente       text not null default '',
  orden        integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_pc_incentivos_kpis_programa
  on pc_incentivos_kpis (programa_id, orden);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table pc_incentivos_kpis enable row level security;

drop policy if exists pc_incentivos_kpis_read on pc_incentivos_kpis;
create policy pc_incentivos_kpis_read on pc_incentivos_kpis
  for select to authenticated using (true);

drop policy if exists pc_incentivos_kpis_write on pc_incentivos_kpis;
create policy pc_incentivos_kpis_write on pc_incentivos_kpis
  for all to authenticated
  using (exists (select 1 from profiles p
                  where p.id = (select auth.uid())
                    and p.role = any (array['admin','admin_rrhh','supervisor']::user_role[])))
  with check (exists (select 1 from profiles p
                  where p.id = (select auth.uid())
                    and p.role = any (array['admin','admin_rrhh','supervisor']::user_role[])));
