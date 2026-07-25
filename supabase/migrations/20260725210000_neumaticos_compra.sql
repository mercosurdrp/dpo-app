-- Datos de compra de la cubierta: sin esto la carga al stock solo guardaba
-- marca/medida/profundidad y la factura como adjunto, así que no se podía saber
-- cuánto costó cada cubierta ni a quién se le compró (el gasto en neumáticos es
-- parte del costo de flota, DPO 3.2 / 3.4).
--
-- Solo Pampeana: en Misiones no existe el módulo de neumáticos.

alter table mantenimiento_neumaticos
  add column if not exists fecha_compra   date,
  add column if not exists proveedor      text,
  add column if not exists costo_unitario numeric(12, 2) check (costo_unitario >= 0);
