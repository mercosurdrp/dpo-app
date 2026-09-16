-- ============================================================================
-- Corrección del typo de patente AF908DF → AE908DF — 16/09/2026
--
-- `AF908DF` es un camión que NO EXISTE. Salió de tipear mal `AE908DF` (Accelo
-- 1016/39) al cargar el egreso TML. Evidencia:
--   · 22 filas en `registros_vehiculos`, todas entre el 18/06 y el 22/07/2026
--   · CERO filas en `catalogo_vehiculos`
--   · CERO ventas en `ventas_diarias`
--   · CERO filas en checklist_vehiculos, vehiculos_lecturas y registro_combustible
--
-- Qué rompe: el cálculo de bultos por empleado cruza `fecha|patente` contra las
-- ventas con match exacto. Como del lado de ventas ese camión no existe, todos
-- los que viajaron en él esos días quedaron en CERO bultos, sin ningún aviso.
--
-- A quién le pega: a los AYUDANTES. Los choferes con una fila fija en
-- `mapeo_empleado_fletero` no lo notaron, porque ese mapeo estático les tapa el
-- agujero. Por eso RIVERO FEDERICO manejó ese camión los 22 días y no perdió
-- nada, mientras DAVALOS ARENA NICOLAS PABLO —que iba de ayudante 13 de esos
-- días y no tiene mapeo fijo— perdió 2.528 bultos.
--
-- Recupera ~5.870 bultos en total, repartidos entre 8 empleados.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PASO 1 — Mirar qué se va a tocar (correr solo, leer el resultado).
-- Tienen que ser 22 filas, todas entre 2026-06-18 y 2026-07-22.
-- ---------------------------------------------------------------------------
select id, fecha, dominio, tipo, chofer, ayudante1, ayudante2
from public.registros_vehiculos
where dominio = 'AF908DF'
order by fecha;


-- ---------------------------------------------------------------------------
-- PASO 2 — Backup de esas filas, por si hay que volver atrás.
-- Queda como tabla suelta; se puede borrar dentro de unas semanas.
-- ---------------------------------------------------------------------------
create table if not exists public.backup_af908df_20260916 as
select * from public.registros_vehiculos where dominio = 'AF908DF';

-- Verificar que el backup quedó con las 22 filas ANTES de seguir:
select count(*) as filas_respaldadas from public.backup_af908df_20260916;


-- ---------------------------------------------------------------------------
-- PASO 3 — La corrección.
-- ---------------------------------------------------------------------------
update public.registros_vehiculos
set dominio = 'AE908DF'
where dominio = 'AF908DF';


-- ---------------------------------------------------------------------------
-- PASO 4 — Verificar. La primera consulta tiene que dar 0.
-- ---------------------------------------------------------------------------
select count(*) as deberia_dar_cero
from public.registros_vehiculos where dominio = 'AF908DF';

select fecha, count(*) as filas
from public.registros_vehiculos
where dominio = 'AE908DF' and fecha between '2026-06-18' and '2026-07-22'
group by fecha order by fecha;


-- ============================================================================
-- Para volver atrás, si hiciera falta:
--
--   update public.registros_vehiculos r
--   set dominio = 'AF908DF'
--   from public.backup_af908df_20260916 b
--   where r.id = b.id;
--
-- ----------------------------------------------------------------------------
-- PARA QUE NO VUELVA A PASAR (esto es código, no SQL):
-- `src/actions/registros-vehiculos.ts:62` guarda el dominio como texto libre
-- (`input.dominio.trim().toUpperCase()`), sin validar contra el catálogo. La
-- solución de fondo es un <Select> de camiones activos en el formulario y el
-- rechazo del alta cuando el dominio no está en `catalogo_vehiculos`. Se puede
-- reforzar con una FK, pero recién DESPUÉS de correr este script (hoy esas 22
-- filas violarían la restricción):
--
--   alter table public.registros_vehiculos
--     add constraint registros_vehiculos_dominio_fk
--     foreign key (dominio) references public.catalogo_vehiculos (dominio);
-- ============================================================================
