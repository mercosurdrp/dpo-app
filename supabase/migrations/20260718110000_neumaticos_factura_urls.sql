-- Foto/PDF de la factura de compra por cubierta (DPO 3.4: respaldo documental
-- del gasto de neumáticos). Array JSON de URLs públicas del bucket de facturas.
ALTER TABLE mantenimiento_neumaticos ADD COLUMN IF NOT EXISTS factura_urls JSONB;
