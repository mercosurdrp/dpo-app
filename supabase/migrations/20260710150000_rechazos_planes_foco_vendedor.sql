-- Foco de preventista en planes de acción de rechazos.
-- La sección "Errores de preventa" (motivos categoría Ventas del catálogo)
-- permite crear planes apuntados a un vendedor de preventa concreto, además
-- del foco por motivo/cliente ya existente. Denormalizado igual que
-- foco_motivo / foco_cliente: id crudo de Chess + display al momento de crear.
ALTER TABLE rechazos_planes ADD COLUMN IF NOT EXISTS foco_vendedor_id INT;
ALTER TABLE rechazos_planes ADD COLUMN IF NOT EXISTS foco_vendedor_ds TEXT;
