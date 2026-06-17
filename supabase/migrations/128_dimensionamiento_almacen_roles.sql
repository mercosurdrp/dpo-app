-- 128: Dimensionamiento de Almacén — roles clasificadores + reempaque (tareas generales) — SOLO Pampeana
-- Almacén pasa de 2 a 4 roles FTE: pickeros, clasificadores (envases), reempaque, maquinistas.
-- Clasificación: volumen = paletas de clasificacion_envases (se dimensiona sobre el PICO);
-- productividad real ~5 pal/HH. Reempaque: volumen+prod de deposito-esteban /api/reempaque/*.
-- La productividad de clasif/reempaque ya es real por hora trabajada → util default 1.

begin;

ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS prod_clasif_pal_h     numeric NOT NULL DEFAULT 5;   -- paletas/HH clasificación
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS util_clasif           numeric NOT NULL DEFAULT 1;   -- % turno clasificando
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS dotacion_clasif       numeric NOT NULL DEFAULT 1;   -- clasificadores actuales
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS prod_reempaque_bul_hh numeric NOT NULL DEFAULT 37;  -- bultos/HH reempaque
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS util_reempaque        numeric NOT NULL DEFAULT 1;   -- % turno reempacando
ALTER TABLE dim_config ADD COLUMN IF NOT EXISTS dotacion_reempaque    numeric NOT NULL DEFAULT 1;   -- tareas generales actuales

-- Dotación real relevada 2026-06-16/17: 1 clasificador, 1 tarea general (reempaque).
UPDATE dim_config SET dotacion_clasif = 1, dotacion_reempaque = 1 WHERE id = 1;

INSERT INTO dim_kpi_objetivos (kpi, nombre, unidad, objetivo, mejor_si) VALUES
  ('productividad_clasif', 'Productividad clasificación', 'pal/HH', 5, 'mayor'),
  ('productividad_reempaque', 'Productividad reempaque', 'bul/HH', 37, 'mayor')
ON CONFLICT (kpi) DO NOTHING;

commit;
