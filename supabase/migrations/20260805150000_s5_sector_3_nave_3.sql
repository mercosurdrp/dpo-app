-- El sector 3 de almacén se llama "Nave 3", no "Nave": es el nombre con el que
-- lo nombra la gente del depósito y con el que hay que buscarlo en la pantalla
-- (pedido del usuario 2026-08-05). Nada del código compara por el nombre —
-- sectores, tareas y auditorías van por `numero`—, así que renombrar es seguro.
--
-- Ya aplicado en la base de Pampeana; la migración queda para que una base
-- nueva salga con el nombre correcto (el seed de 047 dice "Nave").

UPDATE s5_sectores_almacen
SET nombre = 'Nave 3'
WHERE numero = 3
  AND nombre = 'Nave';
