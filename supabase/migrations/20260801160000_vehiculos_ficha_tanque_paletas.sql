-- Maestro de flota (DPO R1.1.2): capacidad de tanque y capacidad en paletas.
--
-- El requisito pide la capacidad del equipo y hasta ahora sólo estaba la carga
-- en kg. Faltaban dos datos que el Gestor de Flota aportó el 01/08/2026:
-- los litros de tanque y cuántas paletas entran.
--
-- Van como columnas propias y NO dentro del texto de `capacidad_carga`: ahí ya
-- había quedado embutida la tara ("Tara 6.500 kg · Cap. máx. 15.000 kg") y hubo
-- que parsearla a mano para el maestro. Un dato numérico que se consulta no
-- puede vivir dentro de una frase.

alter table public.vehiculos_ficha
  add column if not exists tanque_litros integer,
  add column if not exists capacidad_paletas integer,
  add column if not exists cajones_por_paleta integer;

comment on column public.vehiculos_ficha.tanque_litros is
  'Capacidad del tanque de combustible en litros (R1.1.2).';
comment on column public.vehiculos_ficha.capacidad_paletas is
  'Paletas que entran en la unidad (R1.1.2).';
comment on column public.vehiculos_ficha.cajones_por_paleta is
  'Cajones por paleta con los que se arma esa capacidad.';

-- Datos relevados por el Gestor de Flota el 01/08/2026:
--   · tanque de 200 litros en los camiones;
--   · 12 paletas de 50 cajones en 10 camiones;
--   · el AE908DF carga 8 paletas (es el semipesado de la flota).
update public.vehiculos_ficha f
   set tanque_litros = 200,
       capacidad_paletas = case when f.dominio = 'AE908DF' then 8 else 12 end,
       cajones_por_paleta = 50
  from public.catalogo_vehiculos c
 where c.dominio = f.dominio
   and c.tipo = 'camion'
   and c.active;
