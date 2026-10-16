-- =============================================
-- Reunión de Iniciativas de Ahorro: el mismo día que la Reunión de Presupuesto
-- de seguimiento (regla 'presupuesto_seguimiento') — solo Pampeana
-- =============================================
-- Hasta el 16/10/2026 se creaba el 2º día hábil del mes. A esa altura el
-- Cuadro mensual del mes cerrado todavía no está cargado (entra a mitad de
-- mes), así que el aporte al costo por HL de las iniciativas se miraba contra
-- un mes vacío. Desde ahora va el mismo día que la 2ª Reunión de Presupuesto
-- (seguimiento: +7 días del 1er hábil desde el 16), como reunión APARTE con su
-- propia minuta y Action Log. Misma hora (10:00).
--
-- Sólo DML: la regla la evalúa el cron /api/reuniones/cron-crear-diarias.
-- =============================================

BEGIN;

COMMENT ON COLUMN reuniones_tipos_config.regla_especial IS
  'Regla de fecha especial para el cron de creación automática. '
  'quincena_2 = 1er día hábil desde el 16 + 7 días. '
  'presupuesto_seguimiento = el 2º día de quincena_2 (+7). '
  'segundo_lunes = 2º lunes del mes. dia_15_habil = el 15 o el lunes siguiente. '
  'segundo_dia_habil = 2º día hábil (lun-vie) del mes (ya no se usa). NULL = usar dias_semana.';

UPDATE reuniones_tipos_config
   SET regla_especial = 'presupuesto_seguimiento'
 WHERE tipo = 'iniciativas-ahorro';

-- TOR mensual: sólo la frecuencia. Si ya se editó a mano con otro texto, no
-- se pisa.
UPDATE reuniones_tor_docs
   SET contenido = contenido
       || jsonb_build_object(
            'frecuencia_texto',
            'Mensual: el mismo día que la Reunión de Presupuesto de seguimiento (7 días después del 1er día hábil desde el 16), 10:00 hs, como reunión aparte. La app crea la reunión automáticamente.'
          )
 WHERE tipo = 'iniciativas-ahorro'
   AND frecuencia = 'mensual'
   AND contenido->>'frecuencia_texto' LIKE 'Mensual: 2º día hábil%';

COMMIT;
