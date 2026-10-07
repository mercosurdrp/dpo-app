-- Las 4 cubiertas que el recuento físico del depósito del 24/09/2026 no encontró
-- quedaron de baja con el motivo "No apareció en el recuento físico", que no dice
-- nada: en la pantalla se ven con una raya y sin dato. Pasan a "Enviada a la
-- desechadora", que es lo que efectivamente pasó con ellas.
--
--   28R          PIRELLI 0 RENCAUCHE 1   275/80R22.5    4,06 mm
--   1131R        PIRELLI 0 RENCAUCHE 1   275/80R22.5    4,20 mm
--   (sin marca)  Fate DR (taco)          275/80R22.5   16,00 mm
--   (sin marca)  PIRELLI FR:01           235/75R17.5    4,05 mm
--
-- NO se las descuenta del certificado de Kumen Co S.A. del 21/08/2026: siguen sin
-- retiro asociado y el certificado queda en 297 unidades disponibles. Si se decide
-- descontarlas, hay que sumarlas al retiro (residuo_id) y subir cantidad a 7.
--
-- La fecha de baja (24/09/2026) no se toca.

BEGIN;

UPDATE mantenimiento_neumaticos
   SET motivo_baja   = 'Enviada a la desechadora',
       observaciones = COALESCE(observaciones || ' | ', '')
                       || '2026-09-25: no apareció en el recuento físico del depósito del '
                       || '24/09/2026; se registra como enviada a la desechadora.',
       updated_at    = now()
 WHERE estado = 'baja'
   AND motivo_baja LIKE 'No apareció en el recuento físico del depósito%';

-- Control: tienen que quedar las 4 con el motivo nuevo y ninguna con el viejo.
SELECT COALESCE(numero, '(sin marca)') AS numero,
       marca, medida, profundidad_actual_mm, motivo_baja, fecha_baja, residuo_id
  FROM mantenimiento_neumaticos
 WHERE estado = 'baja'
   AND fecha_baja = '2026-09-24'
 ORDER BY numero NULLS LAST;

COMMIT;
