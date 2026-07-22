-- Dimensionamiento — qué zonas absorben el crecimiento de volumen (SOLO Pampeana)
--
-- Hasta ahora el volumen se repartía entre las 5 zonas SIEMPRE proporcional al
-- peso: si el volumen subía 60%, subía 60% en Arrecifes igual que en San Nicolás.
-- La operación real no funciona así (usuario, 2026-07-22): por nivel de servicio
-- las zonas chicas se cubren igual con su camión de siempre, y cuando entra más
-- volumen "sale algún otro camión a San Nicolás o bien a Ramallo".
--
-- Modelo nuevo: el volumen del mes base se reparte por peso como antes, pero
-- TODO el excedente por encima de ese base (sea por crecimiento del mes o por
-- ser un día pico) se asigna solo a las zonas marcadas, proporcional al peso
-- relativo entre ellas.

BEGIN;

ALTER TABLE dim_zonas_reparto
  ADD COLUMN IF NOT EXISTS absorbe_crecimiento boolean NOT NULL DEFAULT false;

UPDATE dim_zonas_reparto SET absorbe_crecimiento = true
  WHERE zona ILIKE 'San Nicol%' OR zona ILIKE 'Ramallo%';

COMMIT;
