-- 111_mapeo_chofer_gescom.sql
-- Mapeo manual codigoChofer de GESCOM → nombre del chofer (análogo a mapeo_patente_chofer
-- de Chess). GESCOM no expone su catálogo de choferes por API (usuario api_mcs solo ventas)
-- y los códigos NO corresponden al maestro de fleteros de Chess.
-- El sync atribuye ventas/rechazos de Gestión a "GESTION-<codigo>"; el nombre se resuelve
-- en lectura desde esta tabla (cargar nombres no requiere re-sync).
-- Idempotente; inocua en Misiones.

create table if not exists public.mapeo_chofer_gescom (
  codigo text primary key,            -- codigoChofer crudo de GESCOM (ej "20014")
  nombre text not null,               -- nombre del chofer
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.mapeo_chofer_gescom enable row level security;

drop policy if exists "mapeo_chofer_gescom_select_authenticated" on public.mapeo_chofer_gescom;
create policy "mapeo_chofer_gescom_select_authenticated"
  on public.mapeo_chofer_gescom for select to authenticated using (true);

drop policy if exists "mapeo_chofer_gescom_all_service_role" on public.mapeo_chofer_gescom;
create policy "mapeo_chofer_gescom_all_service_role"
  on public.mapeo_chofer_gescom for all to service_role using (true) with check (true);
