-- 146: Suma el tipo de unidad "acoplado" (semirremolque) al enum vehiculo_tipo.
-- Necesario para cargar acoplados en catalogo_vehiculos y gestionar sus
-- neumáticos en el módulo de mantenimiento (solo Pampeana).

alter type vehiculo_tipo add value if not exists 'acoplado';
