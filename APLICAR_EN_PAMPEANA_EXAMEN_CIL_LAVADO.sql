-- =====================================================================
-- Examen del CIL de Flota: las dos preguntas del metodo de lavado
-- =====================================================================
--
-- Capacitacion: "CIL de Flota - Limpieza, Inspeccion y Lubricacion de
-- unidades" (05/08/2026), id fe724ea9-d913-453b-9a21-122062de2cf4.
--
-- POR QUE: el examen tiene 11 preguntas y ninguna pregunta COMO se lava.
-- Pregunta donde se lava, como se traba la unidad, que EPP, cada cuanto y
-- donde se registra, pero el metodo -detergente y friccion- no se evalua.
-- Es justo el estandar que pide el requisito R4.2.6 del punto DPO 4.1.
--
-- Los lugares 4 y 5 estan vacios (el orden salta de 3 a 6), asi que las dos
-- preguntas entran ahi: despues del EPP y antes de la frecuencia.
--
-- NO toca ninguna de las 11 preguntas que ya estan, ni las respuestas ya
-- rendidas. La respuesta correcta va primera, igual que en todas las demas.
--
-- Las opciones se guardan como STRING JSON dentro del jsonb, que es como las
-- graba la app (`JSON.stringify`). Por eso el `to_jsonb(...::text)`: guardar
-- un array jsonb crudo aca haria que el examen no muestre las opciones.
--
-- Es idempotente: si ya se corrio, no vuelve a insertar.
-- =====================================================================

INSERT INTO capacitacion_preguntas (capacitacion_id, texto, opciones, respuesta_correcta, orden)
SELECT
  'fe724ea9-d913-453b-9a21-122062de2cf4'::uuid,
  '¿Con qué se lava la unidad?',
  to_jsonb('["Con agua y detergente","Sólo con agua","Con gasoil","Con lo que haya en el taller"]'::text),
  0,
  4
WHERE NOT EXISTS (
  SELECT 1 FROM capacitacion_preguntas
  WHERE capacitacion_id = 'fe724ea9-d913-453b-9a21-122062de2cf4'::uuid
    AND texto = '¿Con qué se lava la unidad?'
);

INSERT INTO capacitacion_preguntas (capacitacion_id, texto, opciones, respuesta_correcta, orden)
SELECT
  'fe724ea9-d913-453b-9a21-122062de2cf4'::uuid,
  '¿Alcanza con tirarle agua con la hidrolavadora?',
  to_jsonb('["No: hay que pasar cepillo o trapo con detergente y después enjuagar","Sí, el agua a presión limpia sola","Sí, si la unidad no está muy sucia","No hace falta enjuagar"]'::text),
  0,
  5
WHERE NOT EXISTS (
  SELECT 1 FROM capacitacion_preguntas
  WHERE capacitacion_id = 'fe724ea9-d913-453b-9a21-122062de2cf4'::uuid
    AND texto = '¿Alcanza con tirarle agua con la hidrolavadora?'
);

-- Verificacion: tienen que quedar 13 preguntas, con el orden 0..12 completo.
SELECT orden, texto, respuesta_correcta
FROM capacitacion_preguntas
WHERE capacitacion_id = 'fe724ea9-d913-453b-9a21-122062de2cf4'::uuid
ORDER BY orden;
