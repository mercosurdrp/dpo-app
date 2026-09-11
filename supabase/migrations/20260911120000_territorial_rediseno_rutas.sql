-- =============================================
-- Rediseño de rutas de un plan territorial (DPO 5.1)
--
-- El auditor de H1 2026 dejó el 5.1 en 0 con esta devolución: "Realizar
-- análisis de reestructuración de rutas en pos de la mejora en el costo/HL,
-- teniendo en cuenta relevamiento de ventas horarias, frecuencia de entrega,
-- rechazo, etc." Y aclaró que el plan territorial toca las rutas de ENTREGA y
-- las de PROMOTORES a la vez: el día de visita del promotor define el día de
-- pedido y ése define el día de reparto.
--
-- Un plan (territorial_planes) tenía sólo título, descripción y una bitácora
-- de avances: el cambio de Colón ("pasa a 3 visitas semanales") estaba escrito
-- en una línea, sin el rutero de antes ni el de después. Esta tabla guarda ese
-- antes/después por plan, en tres bloques:
--
--   preventa   rutero de promotores (ventas): promotores, PDV, días de visita,
--              visitas semanales al pueblo, mix de frecuencia.
--   reparto    rutas de entrega (logística): días de entrega, viajes/semana,
--              paradas/viaje, km/viaje.
--   justificación: ventanas horarias relevadas, rechazo, notas.
--
-- Lo que la app ya sabe NO se guarda acá: el $/HL, las entregas por mes y las
-- entregas por PDV de la ciudad se comparan en vivo (meses antes vs. después
-- de fecha_implementacion) contra la serie de get_territorio_json. Y el
-- rutero VIGENTE de promotores se lee en vivo de la base comercial
-- (ruta_clientes_dia); acá se congela una foto para que la evidencia no cambie
-- cuando ventas vuelva a tocar el rutero.
--
-- `antes` y `despues` son jsonb con la misma forma (RuteroMomento en
-- src/actions/plan-territorial.ts). Son dos fotos del mismo objeto; separarlas
-- en 20 columnas antes_x / despues_x no agregaba ninguna restricción útil.
-- =============================================

CREATE TABLE IF NOT EXISTS territorial_rediseno_rutas (
  plan_id     uuid PRIMARY KEY REFERENCES territorial_planes(id) ON DELETE CASCADE,
  antes       jsonb NOT NULL DEFAULT '{}'::jsonb,
  despues     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Relevamiento de ventas horarias / ventanas de entrega que respalda el cambio.
  ventanas_horarias text,
  -- Por qué se cambió así (rechazo, frecuencia, drop size, capacidad del camión…).
  justificacion     text,
  -- Conclusión cuando cierra el período de comparación (R5.1.4).
  resultado         text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id)
);

COMMENT ON TABLE territorial_rediseno_rutas IS
  'DPO 5.1 — antes/después del rutero de promotores y de las rutas de reparto '
  'de un plan territorial. Es el "análisis de reestructuración de rutas" que '
  'pidió el auditor.';
COMMENT ON COLUMN territorial_rediseno_rutas.antes IS
  'Foto del rutero antes del plan: {promotores, pdv, dias_visita, visitas_sem, '
  'mix_frecuencia, dias_entrega, viajes_sem, paradas_viaje, km_viaje, rechazo_pct}';
COMMENT ON COLUMN territorial_rediseno_rutas.despues IS
  'Misma forma que antes. Se puede precargar desde el rutero vigente de la base '
  'comercial, pero queda congelada acá.';

ALTER TABLE territorial_rediseno_rutas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS territorial_rediseno_rutas_read ON territorial_rediseno_rutas;
CREATE POLICY territorial_rediseno_rutas_read ON territorial_rediseno_rutas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS territorial_rediseno_rutas_write ON territorial_rediseno_rutas;
CREATE POLICY territorial_rediseno_rutas_write ON territorial_rediseno_rutas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p
                 WHERE p.id = (select auth.uid())
                   AND p.role::text = ANY (ARRAY['admin','supervisor','admin_rrhh'])))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p
                      WHERE p.id = (select auth.uid())
                        AND p.role::text = ANY (ARRAY['admin','supervisor','admin_rrhh'])));


-- ---------------------------------------------
-- Semilla: el rediseño de Colón (plan "Revisión de rutas", 27/07/2026)
--
-- El "después" de preventa es la foto del rutero vigente en la base comercial
-- al 11/09/2026 (ruta_clientes_dia): 2 promotores, 147 PDV en rutero de 165
-- activos, Pérez martes-jueves (65 PDV) y Lugo lunes-sábado (82 PDV).
-- Los 3 viajes por semana salen del avance del plan ("pasa a 3 visitas
-- semanales", 24/07/2026). El "antes" y el resto del reparto los completa
-- Sebastián desde la pantalla: la app no tiene historia del rutero.
-- ---------------------------------------------
INSERT INTO territorial_rediseno_rutas (plan_id, antes, despues, ventanas_horarias, justificacion)
VALUES (
  '4385574a-7ee9-4b89-ab6f-20d0f95e3f9f',
  '{}'::jsonb,
  '{"promotores": 2, "pdv": 147, "dias_visita": "Lun · Mar · Mié · Jue · Vie · Sáb", "visitas_sem": 6,
    "mix_frecuencia": "66 semanal · 20 quincenal · 44 trimensual · 17 mensual",
    "viajes_sem": 3}'::jsonb,
  '106 de 165 clientes de Colón con horario relevado por el promotor (base comercial, 11/09/2026).',
  'Unificar rutas de entrega a Colón: pasar a 3 viajes semanales desde el 27/07/2026 (avance del plan). Completar con el rutero anterior y el rechazo del período base.'
)
ON CONFLICT (plan_id) DO NOTHING;
