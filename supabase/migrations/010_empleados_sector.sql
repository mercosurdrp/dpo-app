-- Agregar campo sector a empleados
ALTER TABLE empleados ADD COLUMN sector TEXT NOT NULL DEFAULT 'Distribución';

-- Marcar los de Depósito
UPDATE empleados SET sector = 'Depósito' WHERE legajo IN (30, 107, 110, 112, 135, 159, 173, 180);
