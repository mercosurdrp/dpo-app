-- Salidas programadas: la formación del día (patente + chofer + hasta 2
-- ayudantes) definida por administración ANTES del reparto, desde /salidas.
--
-- Doble propósito:
--   1) Planificación: la salida de mañana se arma acá y se baja como imagen
--      para el grupo de WhatsApp.
--   2) Atribución persona↔camión: chofer y ayudantes se eligen de `empleados`
--      (por ID, sin matcheo por nombre), y los cálculos de Mis Rechazos /
--      bultos por empleado / indicadores de choferes la usan como fuente,
--      después del egreso TML real (que gana si existe, porque refleja lo que
--      efectivamente pasó) y antes del mapeo nominal.
--
-- Idempotente. La tabla se crea en ambos tenants (la pantalla es solo
-- Pampeana, pero los cálculos compartidos la consultan sin romper).

create table if not exists public.salidas_programadas (
  id                    uuid primary key default gen_random_uuid(),
  fecha                 date not null,
  patente               text not null,
  chofer_empleado_id    uuid references public.empleados(id) on delete set null,
  ayudante1_empleado_id uuid references public.empleados(id) on delete set null,
  ayudante2_empleado_id uuid references public.empleados(id) on delete set null,
  notas                 text,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (fecha, patente)
);

create index if not exists idx_salidas_prog_fecha on public.salidas_programadas(fecha desc);

drop trigger if exists trg_salidas_prog_updated_at on public.salidas_programadas;
create trigger trg_salidas_prog_updated_at before update on public.salidas_programadas
  for each row execute function update_updated_at();

alter table public.salidas_programadas enable row level security;

-- Lectura para cualquier autenticado (la imagen y los cálculos la leen);
-- escritura solo vía service_role (las actions validan rol admin/supervisor).
drop policy if exists "salidas_prog_select_authenticated" on public.salidas_programadas;
create policy "salidas_prog_select_authenticated"
  on public.salidas_programadas for select to authenticated using (true);

drop policy if exists "salidas_prog_all_service_role" on public.salidas_programadas;
create policy "salidas_prog_all_service_role"
  on public.salidas_programadas for all to service_role using (true) with check (true);
