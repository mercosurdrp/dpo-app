-- 20260721190000_pc_swot_snapshots.sql
--
-- R3.4.3 del manual DPO 2026 (Pilar Planeamiento, 3.4 Períodos Críticos):
-- "Una vez finalizado el período crítico, el distribuidor analiza y realiza
--  cambios en el análisis SWOT del período crítico."
--
-- El FODA de `pc_swot_items` es un documento VIVO: al cerrar un período se
-- editan los ítems y se los mueve de cuadrante (una debilidad que se resolvió
-- pasa a fortaleza). Ese es el uso correcto, pero pisa el estado anterior: no
-- quedaba forma de demostrar que el análisis "se modificó después del período",
-- que es exactamente lo que se audita.
--
-- Esta tabla congela una copia del FODA completo en un momento dado. El flujo:
--
--   FODA vivo (pc_swot_items)
--     ├─ al planificar el período  → snapshot momento='previo'
--     └─ al cerrar el período      → snapshot momento='posterior'
--
-- Los dos se muestran lado a lado y la diferencia ES la evidencia. El FODA vivo
-- sigue siendo uno solo: acá guardamos fotos, no ramas paralelas.
--
-- `items` va como jsonb (copia embebida, no FK) a propósito: un snapshot tiene
-- que sobrevivir al borrado o edición de los ítems originales; si referenciara
-- pc_swot_items dejaría de ser evidencia en cuanto alguien edite el FODA vivo.

create table if not exists pc_swot_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  periodo_nombre       text not null,
  periodo_anio         integer not null,
  periodo_fecha_inicio date,
  periodo_fecha_fin    date,
  -- 'previo' = FODA de planificación; 'posterior' = revisado tras el período.
  momento              text not null default 'posterior'
                         check (momento in ('previo', 'posterior')),
  -- Fecha a la que corresponde la foto (no la de carga: un período puede
  -- registrarse tarde y la evidencia debe fechar el período, no el trámite).
  fecha_corte          date not null default current_date,
  -- Copia embebida de los ítems: [{categoria, texto, impacto, accion_recomendada}, ...]
  items                jsonb not null default '[]'::jsonb,
  nota                 text not null default '',
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- Un solo snapshot por período y momento: recongelar el mismo momento es
-- corregir la foto, no acumular versiones (para eso está el histórico de otro
-- período). El upsert del endpoint se apoya en esta constraint.
create unique index if not exists uq_pc_swot_snapshots_periodo_momento
  on pc_swot_snapshots (periodo_anio, periodo_nombre, momento);

create index if not exists idx_pc_swot_snapshots_anio
  on pc_swot_snapshots (periodo_anio);

-- ═══════════════════════════ RLS ═══════════════════════════
-- Mismo criterio que el resto de las pc_*: lectura authenticated, escritura
-- admin/admin_rrhh/supervisor. `(select auth.uid())` y no `auth.uid()` suelto:
-- así Postgres lo evalúa una vez (initPlan) en lugar de por fila.
alter table pc_swot_snapshots enable row level security;

drop policy if exists pc_swot_snapshots_read on pc_swot_snapshots;
create policy pc_swot_snapshots_read on pc_swot_snapshots
  for select to authenticated using (true);

drop policy if exists pc_swot_snapshots_write on pc_swot_snapshots;
create policy pc_swot_snapshots_write on pc_swot_snapshots
  for all to authenticated
  using (exists (select 1 from profiles p
                  where p.id = (select auth.uid())
                    and p.role = any (array['admin','admin_rrhh','supervisor']::user_role[])))
  with check (exists (select 1 from profiles p
                  where p.id = (select auth.uid())
                    and p.role = any (array['admin','admin_rrhh','supervisor']::user_role[])));
