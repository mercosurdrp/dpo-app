-- =====================================================================
-- FLOTA · H2 — las cuatro migraciones del 25/08/2026, en orden
--
-- Pegar todo esto de una vez en el SQL editor de Supabase (Pampeana).
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- 🚨 CORRER ESTO **ANTES** DE DEPLOYAR EL CÓDIGO. El código nuevo escribe
-- columnas que todavía no existen: si se deploya primero, guardar una OT con
-- repuestos falla.
--
-- Qué entra:
--   1. Los repuestos de la OT descuentan del pañol (DPO 2.3)
--   2. El ciclo de gestión llega a Flota: OT y KPI (DPO 4.2)
--   3. Origen de las mediciones de neumáticos: alta vs. ronda (DPO 3.4)
--   4. OPL de flota, alcanzadas por el QR de la unidad
-- =====================================================================


-- =============================================================
-- 20260825140000_ot_repuestos_inventario.sql
-- =============================================================
-- Los repuestos de la OT descuentan del inventario (25/08/2026)
--
-- PROBLEMA: el punto 2.3 de DPO pide trazabilidad de las piezas. Hasta hoy la
-- app tenía las dos mitades sin unir:
--
--   * `mantenimiento_realizado_repuestos` guardaba el repuesto de la OT como
--     TEXTO LIBRE ("LIQUIDO REFRIGERANTE — 20 lts"), sin apuntar al ítem del
--     pañol.
--   * `mantenimiento_repuestos_movimientos` tenía el egreso, pero se cargaba a
--     mano, con el motivo también en texto libre ("Cambio de foco en AF028YB —
--     hecho en casa, sin pasar por taller").
--
-- Resultado: un foco cambiado en depósito NO descontaba de ningún lado. El
-- stock del pañol sólo se corregía en el conteo físico mensual, y ahí el
-- desvío aparecía sin causa.
--
-- QUÉ CAMBIA: la fila de repuesto de la OT puede apuntar al ítem de inventario
-- (`repuesto_id`). Cuando apunta, la base registra el egreso sola y deja el
-- movimiento enganchado (`movimiento_id`), en la misma transacción que la OT.
--
-- El campo es OPCIONAL a propósito: el repuesto que se compra para la OT y va
-- directo al camión nunca entró al pañol y no tiene por qué descontar. Sólo se
-- vincula lo que sale del stock. Las filas viejas quedan como están.
--
-- REVERSO: editar o borrar la OT devuelve la pieza al stock con un movimiento
-- de ingreso. El historial queda con el egreso y su reverso, que es lo que un
-- auditor espera ver — no un número que cambió sin rastro.

alter table public.mantenimiento_realizado_repuestos
  add column if not exists repuesto_id uuid
    references public.mantenimiento_repuestos(id) on delete set null,
  add column if not exists movimiento_id uuid
    references public.mantenimiento_repuestos_movimientos(id) on delete set null;

create index if not exists mantenimiento_realizado_repuestos_repuesto_idx
  on public.mantenimiento_realizado_repuestos (repuesto_id)
  where repuesto_id is not null;

comment on column public.mantenimiento_realizado_repuestos.repuesto_id is
  'Ítem del pañol del que salió la pieza. NULL = comprado para la OT, nunca entró al stock.';
comment on column public.mantenimiento_realizado_repuestos.movimiento_id is
  'Egreso de stock que generó esta fila. Lo escribe el trigger; no se toca a mano.';

-- Texto del motivo del movimiento: quien mire el historial del repuesto tiene
-- que poder llegar a la OT sin preguntarle a nadie.
create or replace function public.ot_repuesto_motivo(p_mantenimiento_id uuid)
returns text
language sql
stable
as $$
  select 'OT ' || coalesce(m.numero_ot, '(sin nº)') || ' — ' || m.dominio
  from public.mantenimiento_realizados m
  where m.id = p_mantenimiento_id;
$$;

-- Egreso al cargar la fila, reverso al borrarla, y las dos cosas al editarla.
create or replace function public.fn_ot_repuesto_stock()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_mov public.mantenimiento_repuestos_movimientos;
  v_nombre text;
  v_stock numeric;
begin
  -- Reverso de lo que había (UPDATE y DELETE).
  if (tg_op = 'DELETE' or tg_op = 'UPDATE') and old.movimiento_id is not null then
    perform public.registrar_movimiento_repuesto(
      old.repuesto_id,
      'ingreso',
      old.cantidad,
      'Reverso · ' || coalesce(public.ot_repuesto_motivo(old.mantenimiento_id), 'OT eliminada'),
      null
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Egreso de lo nuevo (INSERT y UPDATE).
  new.movimiento_id := null;
  if new.repuesto_id is not null then
    select nombre, stock_actual into v_nombre, v_stock
    from public.mantenimiento_repuestos
    where id = new.repuesto_id;

    -- El mensaje de la función base no dice de qué repuesto habla. Acá sí, que
    -- es lo único que el que carga la OT puede accionar.
    if v_stock < new.cantidad then
      raise exception 'Stock insuficiente de "%": hay % y la OT descuenta %. Cargá primero el ingreso al pañol, o dejá el repuesto sin vincular si se compró para esta OT.',
        v_nombre, v_stock, new.cantidad;
    end if;

    v_mov := public.registrar_movimiento_repuesto(
      new.repuesto_id,
      'egreso',
      new.cantidad,
      public.ot_repuesto_motivo(new.mantenimiento_id),
      null
    );
    new.movimiento_id := v_mov.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ot_repuesto_stock_ins on public.mantenimiento_realizado_repuestos;
create trigger trg_ot_repuesto_stock_ins
  before insert on public.mantenimiento_realizado_repuestos
  for each row execute function public.fn_ot_repuesto_stock();

drop trigger if exists trg_ot_repuesto_stock_upd on public.mantenimiento_realizado_repuestos;
create trigger trg_ot_repuesto_stock_upd
  before update of repuesto_id, cantidad on public.mantenimiento_realizado_repuestos
  for each row
  when (old.repuesto_id is distinct from new.repuesto_id or old.cantidad is distinct from new.cantidad)
  execute function public.fn_ot_repuesto_stock();

drop trigger if exists trg_ot_repuesto_stock_del on public.mantenimiento_realizado_repuestos;
create trigger trg_ot_repuesto_stock_del
  after delete on public.mantenimiento_realizado_repuestos
  for each row execute function public.fn_ot_repuesto_stock();


-- =============================================================
-- 20260825150000_herramientas_gestion_flota.sql
-- =============================================================
-- El ciclo de gestión llega a Flota (25/08/2026)
--
-- PROBLEMA: las herramientas de gestión (5 Porqués, Causa-Efecto, PDCA) sólo
-- podían colgarse de un plan de acción DPO, de una actividad de reunión o de un
-- reporte de seguridad. Flota no tenía ningún enganche: si la misma OT
-- correctiva se repetía en la misma unidad, no había desde dónde abrir un 5
-- Porqués, y la causa raíz del KPI en rojo se escribía como texto suelto en
-- `flota_plan_accion.causa_raiz`, sin método atrás.
--
-- Se ve en los números: en toda la base hay 12 cinco-porqués y UN PDCA, ninguno
-- de flota. La herramienta existía; el pilar que más correctivo genera no la
-- usaba porque no tenía puerta de entrada.
--
-- QUÉ CAMBIA: dos targets nuevos.
--   * `mantenimiento_id`      → la OT (típicamente correctiva). DPO 4.2.
--   * `flota_plan_accion_id`  → el plan de acción del KPI de flota en rojo.
--
-- El resto no se toca: los tres targets viejos siguen igual y la restricción
-- sigue exigiendo exactamente UNO.

begin;

alter table public.plan_herramientas_gestion
  add column if not exists mantenimiento_id uuid
    references public.mantenimiento_realizados(id) on delete cascade,
  add column if not exists flota_plan_accion_id uuid
    references public.flota_plan_accion(id) on delete cascade;

create index if not exists idx_plan_herramientas_mantenimiento
  on public.plan_herramientas_gestion(mantenimiento_id);
create index if not exists idx_plan_herramientas_flota_plan
  on public.plan_herramientas_gestion(flota_plan_accion_id);

-- Exactamente uno de los CINCO targets.
alter table public.plan_herramientas_gestion
  drop constraint if exists plan_herramientas_target_chk;
alter table public.plan_herramientas_gestion
  add constraint plan_herramientas_target_chk
  check (
    (
      (case when plan_id is not null then 1 else 0 end) +
      (case when reunion_actividad_id is not null then 1 else 0 end) +
      (case when reporte_seguridad_id is not null then 1 else 0 end) +
      (case when mantenimiento_id is not null then 1 else 0 end) +
      (case when flota_plan_accion_id is not null then 1 else 0 end)
    ) = 1
  );

-- ---------------------------------------------------------------------------
-- Permiso de escritura, en una función
--
-- Las políticas de INSERT y UPDATE repetían el mismo bloque de ~40 líneas tres
-- veces (WITH CHECK del insert, USING y WITH CHECK del update). Con dos targets
-- más eran cinco ramas por bloque. La regla pasa a una función y las políticas
-- quedan de una línea; la semántica de los tres targets viejos es idéntica.
-- ---------------------------------------------------------------------------
create or replace function public.puede_escribir_herramienta_gestion(
  p_plan_id uuid,
  p_actividad_id uuid,
  p_reporte_id uuid,
  p_mantenimiento_id uuid,
  p_flota_plan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Editor global: vale para cualquier target.
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'supervisor', 'admin_rrhh')
    )
    -- Plan de acción DPO: responsable del plan o quien lo creó.
    or (p_plan_id is not null and (
      p_plan_id in (select plan_id from public.plan_responsables where profile_id = auth.uid())
      or p_plan_id in (select id from public.planes_accion where created_by = auth.uid())
    ))
    -- Actividad de reunión: su responsable.
    or (p_actividad_id is not null and
      p_actividad_id in (select id from public.reuniones_actividades where responsable_id = auth.uid()))
    -- Reporte de seguridad: quien lo cargó.
    or (p_reporte_id is not null and
      p_reporte_id in (select id from public.reportes_seguridad where creado_por = auth.uid()))
    -- Flota (OT y plan del KPI): sólo editores, que ya son los únicos que
    -- pueden cargar una OT o un plan de flota.
    or false;
$$;

drop policy if exists "herramientas_gestion_insert" on public.plan_herramientas_gestion;
create policy "herramientas_gestion_insert"
  on public.plan_herramientas_gestion for insert to authenticated
  with check (
    public.puede_escribir_herramienta_gestion(
      plan_id, reunion_actividad_id, reporte_seguridad_id, mantenimiento_id, flota_plan_accion_id
    )
  );

drop policy if exists "herramientas_gestion_update" on public.plan_herramientas_gestion;
create policy "herramientas_gestion_update"
  on public.plan_herramientas_gestion for update to authenticated
  using (
    public.puede_escribir_herramienta_gestion(
      plan_id, reunion_actividad_id, reporte_seguridad_id, mantenimiento_id, flota_plan_accion_id
    )
  )
  with check (
    public.puede_escribir_herramienta_gestion(
      plan_id, reunion_actividad_id, reporte_seguridad_id, mantenimiento_id, flota_plan_accion_id
    )
  );

comment on column public.plan_herramientas_gestion.mantenimiento_id is
  'OT sobre la que se aplicó la herramienta (causa raíz del correctivo, DPO 4.2).';
comment on column public.plan_herramientas_gestion.flota_plan_accion_id is
  'Plan de acción del KPI de flota sobre el que se aplicó la herramienta.';

commit;


-- =============================================================
-- 20260825160000_mediciones_neumaticos_origen.sql
-- =============================================================
-- De dónde salió cada medición de dibujo: alta o ronda (25/08/2026)
--
-- PROBLEMA: `mantenimiento_neumatico_mediciones` mezcla dos cosas distintas.
--
--   * El valor NOMINAL que se carga al dar de alta una cubierta (o al volver
--     del recapador): "20 mm", "12,5 mm". Nadie lo midió con calibre — es el
--     dibujo declarado del modelo.
--   * La MEDICIÓN de la ronda mensual, hecha con calibre: 4,68 / 5,15 / 10,84.
--
-- El nominal trae ~1,5–2 mm de más contra lo que después lee el calibre, y como
-- punto de arranque de un tramo mete ese offset entero en el numerador del
-- desgaste. Con eso, la misma goma daba 0,056 o 0,312 mm/1.000 km según cuán
-- vieja fuera el alta: las 33 cubiertas que tenían tasa arrancaban TODAS de un
-- nominal.
--
-- El código lo resolvió con un piso de fecha (`INICIO_MEDICIONES = 2026-07-01`,
-- porque las mediciones reales arrancan el 10/07/2026). Sirve para lo ya
-- cargado, pero no para lo que viene: un alta cargada el mes que viene también
-- va a ser nominal y va a caer del lado bueno de la fecha.
--
-- QUÉ CAMBIA: la fila dice de dónde salió. El piso de fecha se mantiene como
-- segunda barrera para el histórico.

alter table public.mantenimiento_neumatico_mediciones
  add column if not exists origen text not null default 'ronda'
    check (origen in ('alta', 'ronda'));

comment on column public.mantenimiento_neumatico_mediciones.origen is
  'alta = dibujo nominal declarado (alta de la cubierta o retorno del recapado); ronda = medido con calibre. Sólo las de ronda entran al cálculo de desgaste.';

-- Backfill: todo lo anterior al 10/07/2026 (primera ronda con calibre) es
-- nominal. Es el mismo criterio que ya aplica el código, ahora escrito en el
-- dato. Verificado sobre las 243 filas: antes de julio/2026 son números
-- redondos y repetidos por lote de alta.
update public.mantenimiento_neumatico_mediciones
set origen = 'alta'
where fecha < date '2026-07-01' and origen <> 'alta';

create index if not exists idx_neum_mediciones_origen
  on public.mantenimiento_neumatico_mediciones (neumatico_id, fecha)
  where origen = 'ronda';


-- =============================================================
-- 20260825170000_flota_opl.sql
-- =============================================================
-- OPL de flota: lecciones de un punto por unidad, alcanzables por QR (25/08/2026)
--
-- QUÉ ES: una OPL (lección de un punto) es una hoja sola que explica UNA cosa
-- —cómo se controla el nivel de aceite, cómo se mide el dibujo, qué mira el
-- chofer en la lona—. Sirve si está donde se hace el trabajo y en el momento en
-- que se hace. Hasta hoy no existían en la app: el estándar vivía en un SOP de
-- 20 páginas que nadie abre parado al lado de la rueda.
--
-- CÓMO LLEGA A LA MANO: cada unidad lleva pegado su QR (lo imprime
-- /api/vehiculos/qr-pdf). Al escanearlo se abre la unidad en la app y ahí están
-- las OPL que le aplican por tipo. Alcanza a las tres familias que pidió la
-- operación: los camiones, las unidades de depósito (autoelevadores, zorras) y
-- las de Team Run.
--
-- ALCANCE POR TIPO, no por unidad: la OPL de "control de dibujo" es la misma
-- para los 11 camiones. `tipos` vacío = aplica a todas.

create table if not exists public.flota_opl (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  /** Tipos de unidad a los que aplica (catalogo_vehiculos.tipo). Vacío = todas. */
  tipos text[] not null default '{}',
  /** Punto del pilar Flota que la OPL evidencia (ej. "1.3"). */
  punto_dpo text,
  archivo_path text,
  archivo_url text,
  archivo_nombre text,
  activo boolean not null default true,
  orden integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_flota_opl_activo on public.flota_opl (activo, orden);

alter table public.flota_opl enable row level security;

-- Lectura para cualquier usuario autenticado: el que escanea el QR es el chofer
-- o el operario de depósito, no el supervisor.
drop policy if exists flota_opl_read on public.flota_opl;
create policy flota_opl_read on public.flota_opl
  for select to authenticated using (true);

drop policy if exists flota_opl_write on public.flota_opl;
create policy flota_opl_write on public.flota_opl
  for all to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and (p.role)::text = any (array['admin','supervisor'])))
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and (p.role)::text = any (array['admin','supervisor'])));

comment on table public.flota_opl is
  'Lecciones de un punto de flota. Se alcanzan escaneando el QR de la unidad; el archivo vive en el bucket mantenimiento-evidencias bajo opl/.';

