-- Venta por FACTURA PRESUPUESTO (Chess idDocumento=PRVTA, ticket no fiscal,
-- canal "SEGUNDA VUELTA" ~95%): ~6.000 HL/mes que el sync ignoraba por filtrar
-- solo FCVTA. Se generaliza el par de tablas de mostrador con `ds_documento`
-- ('FCVTA' = mostrador físico, 'PRVTA' = presupuesto/2da vuelta) en vez de
-- crear otro par de tablas. Identidad del cuadro mensual:
--   Vendidos = Distribuidos (FCVTA patente + Gestión) + Mostrador (FCVTA sin
--   patente) + Presupuesto (PRVTA).

alter table public.ventas_mostrador_diarias
  add column if not exists ds_documento text not null default 'FCVTA';
alter table public.ventas_mostrador_diarias
  drop constraint if exists ventas_mostrador_diarias_key;
alter table public.ventas_mostrador_diarias
  add constraint ventas_mostrador_diarias_key unique (fecha, ds_documento, ds_fletero_carga);

alter table public.ventas_mostrador_sku
  add column if not exists ds_documento text not null default 'FCVTA';
alter table public.ventas_mostrador_sku
  drop constraint if exists ventas_mostrador_sku_key;
alter table public.ventas_mostrador_sku
  add constraint ventas_mostrador_sku_key unique (fecha, ds_documento, id_articulo);

-- CEq mensual de lo NO distribuido, desagregado por documento (reemplaza a
-- cuadro_ceq_mostrador_mensual, que asumía solo mostrador).
DROP FUNCTION IF EXISTS cuadro_ceq_mostrador_mensual(date);
CREATE OR REPLACE FUNCTION cuadro_ceq_no_distribuido_mensual(p_desde date)
RETURNS TABLE(mes text, ds_documento text, ceq numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_char(s.fecha, 'YYYY-MM') AS mes,
         s.ds_documento,
         sum(s.bultos * a.ceq_factor) AS ceq
  FROM ventas_mostrador_sku s
  JOIN chess_articulos a ON a.id_articulo = s.id_articulo
  WHERE s.fecha >= p_desde AND a.ceq_factor IS NOT NULL
  GROUP BY 1, 2;
$$;
