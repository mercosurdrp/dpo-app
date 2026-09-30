-- Comprobantes de la OT: qué cubre cada uno.
--
-- El taller factura su mano de obra y el proveedor de repuestos la suya (la OT
-- 1786 del AF664NY, 30/09/2026: Bettiolo por la mano de obra y Escuer Julio por
-- los repuestos). Hasta ahora las dos caían en la misma bolsa y el costo de la
-- OT no se podía abrir por concepto aunque los papeles vinieran separados.
--
-- El código tolera que esta columna todavía no exista (insert con reintento
-- ante 42703), así que aplicarla no es urgente: sin ella la factura se guarda
-- igual, sin el concepto.

alter table mantenimiento_realizado_facturas
  add column if not exists concepto text
  check (concepto is null or concepto in ('mano_obra', 'repuestos', 'mixta'));

comment on column mantenimiento_realizado_facturas.concepto is
  'mano_obra | repuestos | mixta. null = comprobante cargado antes del 30/09/2026.';
