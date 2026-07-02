-- Ventas de MOSTRADOR (Chess): líneas FCVTA sin patente válida (fletero
-- "MOSTRADOR RAMALLO" etc.) que el sync descartaba — `ventas_diarias` guarda
-- solo lo DISTRIBUIDO en camión. Alimenta las secciones nuevas del cuadro
-- mensual: "Ventas" (= distribuido Chess + mostrador) y "Venta mostrador".
-- Tablas separadas a propósito: agregarlas a ventas_diarias con otro `origen`
-- inflaría a todos los consumidores que no filtran origen (cuadro Entrega,
-- reuniones, etc.). Inocua en Misiones (queda vacía hasta que el sync escriba).

create table if not exists public.ventas_mostrador_diarias (
  id bigint generated always as identity primary key,
  fecha date not null,
  ds_fletero_carga text not null,
  total_bultos numeric not null default 0,
  total_unidades numeric not null default 0,
  total_hl numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint ventas_mostrador_diarias_key unique (fecha, ds_fletero_carga)
);

create index if not exists idx_ventas_mostrador_diarias_fecha
  on public.ventas_mostrador_diarias (fecha);

alter table public.ventas_mostrador_diarias enable row level security;

drop policy if exists "ventas_mostrador_diarias_select_authenticated" on public.ventas_mostrador_diarias;
create policy "ventas_mostrador_diarias_select_authenticated"
  on public.ventas_mostrador_diarias for select to authenticated using (true);

drop policy if exists "ventas_mostrador_diarias_all_service_role" on public.ventas_mostrador_diarias;
create policy "ventas_mostrador_diarias_all_service_role"
  on public.ventas_mostrador_diarias for all to service_role using (true) with check (true);

-- Detalle por SKU/día del mostrador (para CEq = bultos × ceq_factor).
create table if not exists public.ventas_mostrador_sku (
  id bigint generated always as identity primary key,
  fecha date not null,
  id_articulo integer not null,
  ds_articulo text not null,
  bultos numeric not null default 0,
  hl numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint ventas_mostrador_sku_key unique (fecha, id_articulo)
);

create index if not exists idx_ventas_mostrador_sku_fecha
  on public.ventas_mostrador_sku (fecha);

alter table public.ventas_mostrador_sku enable row level security;

drop policy if exists "ventas_mostrador_sku_select_authenticated" on public.ventas_mostrador_sku;
create policy "ventas_mostrador_sku_select_authenticated"
  on public.ventas_mostrador_sku for select to authenticated using (true);

drop policy if exists "ventas_mostrador_sku_all_service_role" on public.ventas_mostrador_sku;
create policy "ventas_mostrador_sku_all_service_role"
  on public.ventas_mostrador_sku for all to service_role using (true) with check (true);

-- CEq mensual del mostrador (análoga a cuadro_ceq_mensual de la mig 138).
CREATE OR REPLACE FUNCTION cuadro_ceq_mostrador_mensual(p_desde date)
RETURNS TABLE(mes text, ceq numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
         sum(s.bultos * a.ceq_factor) AS ceq
  FROM ventas_mostrador_sku s
  JOIN chess_articulos a ON a.id_articulo = s.id_articulo
  WHERE s.fecha >= p_desde AND a.ceq_factor IS NOT NULL
  GROUP BY 1;
$$;

-- CEq mensual distribuido SOLO Chess. La función de la mig 138 suma
-- ventas_diarias_sku sin filtrar origen (chess + gestion); la sección "Ventas"
-- es solo Chess (venta total Chess = esto + mostrador).
CREATE OR REPLACE FUNCTION cuadro_ceq_chess_mensual(p_desde date)
RETURNS TABLE(mes text, ceq numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
         sum(s.bultos * a.ceq_factor) AS ceq
  FROM ventas_diarias_sku s
  JOIN chess_articulos a ON a.id_articulo = s.id_articulo
  WHERE s.fecha >= p_desde AND s.origen = 'chess' AND a.ceq_factor IS NOT NULL
  GROUP BY 1;
$$;
