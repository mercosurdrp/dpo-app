-- El auxilio en ruta, arriba de todo en la pirámide de fallas (18/09/2026)
--
-- PROBLEMA: la pirámide tenía como nivel más grave la "avería grave", que es el
-- correctivo que dejó la unidad fuera de servicio. Pero la falla más cara no es
-- esa: es la que deja el camión tirado EN LA RUTA, con el reparto arriba y un
-- auxilio yendo a buscarlo. Eso no se registraba en ninguna tabla: el único caso
-- rastreable del año está escrito a mano en las observaciones de la OT 1717 del
-- AF469UR (23/06/2026, "se tuvo que realizar un auxilio ya que el camión
-- presentó una falla en la aceleración").
--
-- QUÉ CAMBIA: un tilde en la OT. Es la punta de la pirámide y el KPI que de
-- verdad duele, así que tiene que poder contarse, no buscarse leyendo texto.
--
-- Va como columna y no como tipo de OT nuevo a propósito: el auxilio no
-- reemplaza al correctivo (la reparación se hace igual y se carga igual), lo
-- califica. Sumarlo a preventivo/correctivo/proactivo habría roto todas las
-- cuentas que separan por tipo.

alter table public.mantenimiento_realizados
  add column if not exists auxilio_ruta boolean not null default false;

comment on column public.mantenimiento_realizados.auxilio_ruta is
  'La unidad quedó parada fuera de la planta y hubo que ir a asistirla. Es el nivel más grave de la pirámide de fallas; no reemplaza al tipo de OT, lo califica.';

create index if not exists mantenimiento_realizados_auxilio_idx
  on public.mantenimiento_realizados (fecha)
  where auxilio_ruta;

-- El caso conocido del año: AF469UR, 23/06/2026, falla de aceleración en ruta.
update public.mantenimiento_realizados
set auxilio_ruta = true
where id = '7c28fc1f-069e-4a0f-bc40-c02a6b0855af';

-- Verificación
select numero_ot, fecha, dominio, tipo, auxilio_ruta
from public.mantenimiento_realizados
where auxilio_ruta
order by fecha desc;
