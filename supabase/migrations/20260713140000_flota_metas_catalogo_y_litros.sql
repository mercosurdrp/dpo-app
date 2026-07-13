-- Cierre del pilar Flota (DPO): metas de los 7 KPIs que quedaban sin definir,
-- limpieza del catálogo de unidades y guarda contra las cargas de combustible
-- tipeadas con separador de miles.

-- 1) Metas de los KPIs que quedaron en NULL. Los valores salen de la historia
--    real de la flota (km/l, CO2 y costo) o del estándar DPO cuando todavía no
--    hay datos cargados (exactitud de inventario, tareas CIL).
INSERT INTO flota_metas (kpi, meta, comparador, unidad) VALUES
  ('combustible_kml',      3.90, '>=', 'km/l'),   -- abr 3,85 · may 4,12 · jun 3,66
  ('co2_flota',           18000, '<=', 'kg'),     -- may 18.114 kg · jun 18.448 kg
  ('costo_total',      10000000, '<=', '$'),      -- promedio ene-jun 2026: $9,7M
  ('checklist_deteccion',    50, '>=', '%'),      -- base: may 0% · jun 20%
  ('checklist_resolucion',    7, '<=', 'días'),
  ('inventario_exactitud',   95, '>=', '%'),
  ('cil_tareas',             20, '>=', '#')
ON CONFLICT (kpi) DO UPDATE
  SET meta = EXCLUDED.meta,
      comparador = EXCLUDED.comparador,
      unidad = EXCLUDED.unidad,
      updated_at = now();

-- 2) El autoelevador Toyota 3 ya no está en el depósito (el 1 y el 2 se dieron
--    de baja en 07/2026). Sale de la matriz de estándares y de los KPIs.
UPDATE catalogo_vehiculos
   SET active = false,
       descripcion = 'Autoelevador Toyota 3 (depósito) — baja 07/2026'
 WHERE dominio = 'TOYOTA3';

-- 3) Urea real por unidad: no todos los camiones la usan y en varios el sistema
--    quedó anulado. La ficha decía "Urea" en todos.
UPDATE vehiculos_ficha SET combustible_aux = 'No tiene', updated_at = now()
 WHERE dominio = 'AC165AJ';
UPDATE vehiculos_ficha SET combustible_aux = 'Aceite de motor (sin urea)', updated_at = now()
 WHERE dominio = 'OJA403';
UPDATE vehiculos_ficha SET combustible_aux = 'Urea (anulada)', updated_at = now()
 WHERE dominio IN ('AE591EI', 'AF028YB', 'AF469UR', 'AF664NY');

-- 4) Dos cargas se tipearon con el punto como separador de miles y arruinaron el
--    rendimiento y la huella de CO2 de su mes. La de AF588SU (134938 -> 134,94)
--    ya se corrigió a mano; la de OJA403 (350604) se reconstruye en 155 l: es lo
--    que dan los 542 km del tramo al rendimiento habitual de esa unidad (~3,5
--    km/l), y sus cargas vecinas fueron de 155, 158 y 159 l.
UPDATE registro_combustible
   SET litros = 155.00,
       rendimiento = round((km_recorridos::numeric / 155.00), 2)
 WHERE dominio = 'OJA403' AND fecha = '2026-04-22' AND litros > 500;

-- El tanque más grande de la flota ronda los 300 l, así que 500 es un techo
-- holgado que igual ataja el error de tipeo.
ALTER TABLE registro_combustible
  ADD CONSTRAINT registro_combustible_litros_plausibles
  CHECK (litros IS NULL OR (litros > 0 AND litros <= 500));
