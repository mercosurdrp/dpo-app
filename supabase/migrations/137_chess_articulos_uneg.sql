-- Clasificación de producto (uneg/segmento) en el maestro chess_articulos.
-- Se usa para el desglose por familia (Cervezas/Aguas/Gaseosas) del modal de
-- "Bultos vendidos" del cuadro mensual. La fuente de estos campos es el pool
-- gerencial Mercosur (tabla `articulos`), que se vuelca a chess_articulos vía
-- el endpoint /api/indicadores/sync-familias (no viene en la API REST /articulos).

ALTER TABLE chess_articulos
  ADD COLUMN IF NOT EXISTS uneg text,
  ADD COLUMN IF NOT EXISTS segmento text;
