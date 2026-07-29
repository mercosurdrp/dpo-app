-- Envíos a recapado: el remito de ida y vuelta al recapador.
--
-- Hasta ahora la cubierta que iba a recapar quedaba en `para_recapar` y volvía
-- con un botón ("Volvió del recapado") que no dejaba rastro de NADA: ni a qué
-- recapador fue, ni cuándo, ni qué costó. Hoy hay 19 cubiertas recapadas en la
-- flota y de ninguna se sabe cuánto salió el recapado.
--
-- No se puede modelar como una OT: la OT es de UNA unidad y un envío mezcla
-- cubiertas de varios camiones; además el costo es de la cubierta (para el
-- costo por km de la goma), no del camión.
--
-- Solo Pampeana: en Misiones no existe el módulo de neumáticos.

-- ==================== Estado "en el recapador" ====================
-- `para_recapar` = está en el depósito esperando que la manden.
-- `en_recapado`  = ya salió, está en poder del recapador (no está en casa).
alter table mantenimiento_neumaticos
  drop constraint if exists mantenimiento_neumaticos_estado_check;

alter table mantenimiento_neumaticos
  add constraint mantenimiento_neumaticos_estado_check
  check (estado in ('stock', 'para_recapar', 'en_recapado', 'instalado', 'baja'));

-- Cuántas veces se recapó esta misma cubierta. El recapador devuelve la goma
-- con el MISMO código, así que la cubierta es siempre la misma fila y lo único
-- que hay que llevar es el contador de vueltas.
alter table mantenimiento_neumaticos
  add column if not exists vueltas_recapado integer not null default 0
    check (vueltas_recapado >= 0);

-- Las que ya figuran como recapadas volvieron del recapador al menos una vez
-- (el dato de cuántas veces no existe: es el mínimo conocido).
update mantenimiento_neumaticos
set vueltas_recapado = 1
where tipo = 'recapado' and vueltas_recapado = 0;

-- ==================== Remito de envío ====================

create table if not exists mantenimiento_recapados (
  id             uuid primary key default gen_random_uuid(),
  /** Remito/comprobante con el que salieron (el del recapador o uno interno). */
  numero_remito  text,
  /** El recapador (mismo catálogo de proveedores que el resto del módulo). */
  proveedor      text not null,
  fecha_envio    date not null default current_date,
  fecha_retorno  date,
  estado         text not null default 'enviado'
                   check (estado in ('enviado', 'recibido')),
  /** Factura del recapado (llega con la devolución). */
  factura_numero text,
  factura_urls   text[],
  /** Lo facturado por todo el envío; se prorratea entre las que volvieron. */
  costo_total    numeric(12, 2) check (costo_total >= 0),
  observaciones  text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists mant_recapados_estado_idx
  on mantenimiento_recapados (estado, fecha_envio desc);

-- ==================== Cubiertas de cada envío ====================
-- Cada fila es una cubierta dentro del remito, con la foto de cómo salió y de
-- cómo volvió. Los datos del envío se copian (número, marca, medida, de qué
-- unidad venía) para que el remito siga siendo legible aunque después la
-- cubierta cambie o se borre.

create table if not exists mantenimiento_recapado_items (
  id                     uuid primary key default gen_random_uuid(),
  recapado_id            uuid not null
                           references mantenimiento_recapados(id) on delete cascade,
  neumatico_id           uuid not null
                           references mantenimiento_neumaticos(id) on delete cascade,
  -- Cómo salió
  numero_envio           text,
  marca                  text,
  medida                 text,
  /** De qué unidad venía (se lee del último desmontaje; solo informativo). */
  dominio_origen         text,
  profundidad_envio_mm   numeric(5, 2),
  -- Cómo volvió
  /** Código con el que la devolvió el recapador. Normalmente el mismo; si el
   *  recapador le pone uno nuevo, se guarda acá y se actualiza la cubierta. */
  numero_retorno         text,
  profundidad_retorno_mm numeric(5, 2),
  /** Parte del costo total que le tocó (prorrateo entre las recapadas). */
  costo                  numeric(12, 2) check (costo >= 0),
  resultado              text not null default 'pendiente'
                           check (resultado in ('pendiente', 'recapada', 'descartada')),
  observaciones          text,
  created_at             timestamptz not null default now(),
  unique (recapado_id, neumatico_id)
);

create index if not exists mant_recapado_items_recapado_idx
  on mantenimiento_recapado_items (recapado_id);

create index if not exists mant_recapado_items_neumatico_idx
  on mantenimiento_recapado_items (neumatico_id);

-- ==================== Movimientos ====================
-- La ida y la vuelta al recapador también son movimientos de la cubierta, así
-- entran en su historial junto al montaje/desmontaje/baja.
alter table mantenimiento_neumatico_movimientos
  drop constraint if exists mantenimiento_neumatico_movimientos_tipo_check;

alter table mantenimiento_neumatico_movimientos
  add constraint mantenimiento_neumatico_movimientos_tipo_check
  check (tipo in ('montaje', 'desmontaje', 'baja', 'envio_recapado', 'retorno_recapado'));

-- ==================== RLS ====================
-- Lectura para todos los logueados, escritura admin/supervisor (igual que el
-- resto de las tablas del módulo).

alter table mantenimiento_recapados enable row level security;
alter table mantenimiento_recapado_items enable row level security;

drop policy if exists mant_recapados_read on mantenimiento_recapados;
create policy mant_recapados_read on mantenimiento_recapados
  for select using (true);

drop policy if exists mant_recapados_write on mantenimiento_recapados;
create policy mant_recapados_write on mantenimiento_recapados
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role::text = any (array['admin', 'supervisor'])
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role::text = any (array['admin', 'supervisor'])
    )
  );

drop policy if exists mant_recapado_items_read on mantenimiento_recapado_items;
create policy mant_recapado_items_read on mantenimiento_recapado_items
  for select using (true);

drop policy if exists mant_recapado_items_write on mantenimiento_recapado_items;
create policy mant_recapado_items_write on mantenimiento_recapado_items
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role::text = any (array['admin', 'supervisor'])
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role::text = any (array['admin', 'supervisor'])
    )
  );
