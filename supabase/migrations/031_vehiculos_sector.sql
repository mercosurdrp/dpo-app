-- =============================================
-- Agregar sector a catalogo_vehiculos + vehículos de depósito
-- (autoelevadores Toyota 1 y 2 + camionetas AF199RD y AF199RE)
-- =============================================

CREATE TYPE vehiculo_sector AS ENUM ('distribucion', 'deposito');

CREATE TYPE vehiculo_tipo AS ENUM (
  'camion',
  'camioneta',
  'autoelevador',
  'utilitario'
);

ALTER TABLE catalogo_vehiculos
  ADD COLUMN sector vehiculo_sector NOT NULL DEFAULT 'distribucion',
  ADD COLUMN tipo vehiculo_tipo;

CREATE INDEX idx_catalogo_vehiculos_sector ON catalogo_vehiculos(sector);

-- Tipar los camiones existentes como 'camion' (todo lo que venía era flota de distribución)
UPDATE catalogo_vehiculos SET tipo = 'camion' WHERE tipo IS NULL;

-- Insertar los 4 vehículos de depósito
INSERT INTO catalogo_vehiculos (dominio, descripcion, sector, tipo, active)
VALUES
  ('TOYOTA1', 'Autoelevador Toyota 1 (depósito)', 'deposito', 'autoelevador', true),
  ('TOYOTA2', 'Autoelevador Toyota 2 (depósito)', 'deposito', 'autoelevador', true),
  ('AF199RD', 'Camioneta depósito', 'deposito', 'camioneta', true),
  ('AF199RE', 'Camioneta depósito', 'deposito', 'camioneta', true)
ON CONFLICT (dominio) DO UPDATE
  SET sector = EXCLUDED.sector,
      tipo = EXCLUDED.tipo,
      descripcion = EXCLUDED.descripcion,
      active = true;
