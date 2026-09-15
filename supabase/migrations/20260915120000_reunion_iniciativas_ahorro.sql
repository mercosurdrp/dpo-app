-- =============================================
-- Reunión de Iniciativas de Ahorro (módulo /reuniones) — solo Pampeana
-- + TOR mensual de Presupuesto e Iniciativas de Ahorro
-- =============================================
-- Nuevo tipo de reunión 'iniciativas-ahorro': una vez al mes, el 2º día hábil
-- a las 10:00, se revisan las iniciativas de ahorro de /presupuesto (Rutina de
-- Campeones 5.2) con foco en obsolescencia, roturas y combustible.
--
-- Calendario automático: regla 'segundo_dia_habil' evaluada en el cron
-- /api/reuniones/cron-crear-diarias (2º día lunes-viernes del mes, sin
-- feriados, igual que las otras reglas).
--
-- También carga la TOR (Términos de Referencia) mensual de la Reunión de
-- Presupuesto, que nunca se sembró (reuniones_tor_docs sólo tenía las del
-- Excel de mayo 2026), y la de la reunión nueva. ON CONFLICT DO NOTHING: si ya
-- se editaron desde la app, no las pisa.
--
-- Esta migración se aplica SOLO al ref de Pampeana (dpo). Misiones no usa
-- estas solapas (gateadas con !IS_MISIONES en la UI).
-- =============================================

BEGIN;

-- 1) Ampliar el CHECK del tipo en la config y en la tabla de TOR.
--    reuniones_tor_docs nunca sumó 'mantenimiento' (por eso esa solapa no
--    podía guardar TOR): se corrige acá de paso.
ALTER TABLE reuniones_tipos_config
  DROP CONSTRAINT IF EXISTS reuniones_tipos_config_tipo_check;
ALTER TABLE reuniones_tipos_config
  ADD CONSTRAINT reuniones_tipos_config_tipo_check
  CHECK (tipo IN (
    'logistica','logistica-ventas','matinal-distribucion','warehouse',
    'presupuesto','mantenimiento','iniciativas-ahorro'
  ));

ALTER TABLE reuniones_tor_docs
  DROP CONSTRAINT IF EXISTS reuniones_tor_docs_tipo_check;
ALTER TABLE reuniones_tor_docs
  ADD CONSTRAINT reuniones_tor_docs_tipo_check
  CHECK (tipo IN (
    'logistica','logistica-ventas','matinal-distribucion','warehouse',
    'presupuesto','mantenimiento','iniciativas-ahorro'
  ));

COMMENT ON COLUMN reuniones_tipos_config.regla_especial IS
  'Regla de fecha especial para el cron de creación automática. '
  'quincena_2 = 1er día hábil desde el 16 + 7 días. '
  'segundo_lunes = 2º lunes del mes. '
  'segundo_dia_habil = 2º día hábil (lun-vie) del mes. NULL = usar dias_semana.';

-- 2) Alta del tipo.
--    dias_semana = L-V habilita la creación MANUAL en días hábiles; la creación
--    AUTOMÁTICA se rige por regla_especial, no por dias_semana.
INSERT INTO reuniones_tipos_config (tipo, nombre, dias_semana, regla_especial) VALUES
  ('iniciativas-ahorro', 'Reunión de Iniciativas de Ahorro', ARRAY[1,2,3,4,5], 'segundo_dia_habil')
ON CONFLICT (tipo) DO UPDATE
  SET nombre         = EXCLUDED.nombre,
      dias_semana    = EXCLUDED.dias_semana,
      regla_especial = EXCLUDED.regla_especial;

-- 3) Participantes fijos (resueltos por email para no hardcodear UUIDs).
INSERT INTO reuniones_participantes_fijos (tipo, profile_id)
SELECT 'iniciativas-ahorro', p.id
FROM profiles p
WHERE p.email IN (
  'sroselli@mercosur.local',                  -- Sebastián Roselli (JDL)
  'emartinez@mercosurdistribuciones.com.ar',  -- Estefanía Martínez (Analista de Presupuesto)
  'ealtube@mercosur.local',                   -- Esteban Altube (SDD)
  'fazzaretti@mercosurdrp.com.ar'             -- Fausto Azzaretti (SDF / SDE)
)
ON CONFLICT (tipo, profile_id) DO NOTHING;

-- 4) TOR mensual de las dos reuniones.
INSERT INTO reuniones_tor_docs (tipo, frecuencia, contenido) VALUES

('presupuesto', 'mensual', $tor$
{
  "nombre": "Reunión de Presupuesto",
  "objetivos": "Revisar el cierre del mes anterior contra el presupuesto: entender cada desvío por rubro (real vs. presupuestado), asignar responsable y compromiso a los que lo requieren y, una semana después, verificar qué pasó con esos compromisos.",
  "dueno": [
    "JDL"
  ],
  "participantes": [
    "JDL — Sebastián Roselli",
    "Analista de Presupuesto — Estefanía Martínez",
    "SDD — Esteban Altube",
    "SDF / SDE — Fausto Azzaretti",
    "JD RR.HH — Daniel Avaro"
  ],
  "ubicacion": [
    "Oficina de Logística",
    "Zoom"
  ],
  "duracion": "1ª reunión (desvíos): 60 min · 2ª reunión (seguimiento): 30 min",
  "frecuencia_texto": "Mensual en dos encuentros: 1er día hábil desde el 16 (si el 16 cae sábado o domingo, el lunes) y exactamente 7 días después. La app crea las dos reuniones automáticamente.",
  "reglas": [
    "Ser puntual con la reunión; si alguien no puede asistir, avisar con anticipación",
    "El EERR del mes cerrado y los desvíos se cargan en /presupuesto ANTES de la primera reunión: la reunión muestra el período anterior (la de julio mira junio)",
    "Semáforo de desvíos: verde < 5 %, ámbar de 5 a 15 %, rojo ≥ 15 %. Los rojos salen de la reunión con responsable y compromiso; los ámbar se explican; los verdes no se tratan salvo tendencia",
    "Cada compromiso queda en el Action Log de la reunión con responsable y fecha",
    "En la reunión de seguimiento no se abren desvíos nuevos: sólo se revisa el estado de cada compromiso y de los planes de acción",
    "La minuta y los adjuntos se cargan en la reunión de la app, no quedan en mails"
  ],
  "entradas": [
    "EERR del mes cerrado cargado en /presupuesto",
    "Desvíos generados por rubro (presupuestado, real, % de desvío, responsable)",
    "Costo logístico del mes cerrado ($/HL, vs. mes anterior y YTD) y peso de cada ciudad en el costo (Planeamiento → Costo por PDV)",
    "Action Log de la reunión anterior",
    "Planes de acción abiertos vinculados a desvíos"
  ],
  "salidas": [
    "Cada desvío rojo con causa, responsable y compromiso en el Action Log",
    "Planes de acción nuevos o actualizados en /presupuesto",
    "Estado de cada compromiso verificado en la reunión de seguimiento (hecho / en curso / no comenzado)",
    "Minuta y adjuntos cargados en la reunión"
  ],
  "kpis": [
    "Desvío total del mes vs. presupuesto (%)",
    "Desvío por rubro (verde < 5 %, ámbar < 15 %, rojo ≥ 15 %)",
    "Cantidad de desvíos rojos del mes",
    "% de compromisos cumplidos a la reunión de seguimiento",
    "Costo logístico VLC/HL del mes y YTD, y $/HL por ciudad"
  ],
  "temario": [
    {
      "tema": "1ª reunión — Revisar el Action Log y los planes de acción de la reunión anterior",
      "quien": "JDL"
    },
    {
      "tema": "1ª reunión — Cierre del mes anterior: EERR y desvíos por rubro",
      "quien": "Analista de Presupuesto"
    },
    {
      "tema": "1ª reunión — Costo logístico del mes: $/HL, tendencia y cómo pesa cada ciudad",
      "quien": "JDL"
    },
    {
      "tema": "1ª reunión — Causa de cada desvío rojo y ámbar",
      "quien": "Responsable del rubro (SDD / SDF / RR.HH)"
    },
    {
      "tema": "1ª reunión — Definir compromisos, responsables y fechas (Action Log) y abrir planes de acción si hace falta",
      "quien": "JDL"
    },
    {
      "tema": "2ª reunión (+7 días) — Estado de cada compromiso: hecho, en curso o no comenzado",
      "quien": "Responsable de cada compromiso"
    },
    {
      "tema": "2ª reunión — Ajustar planes de acción y fechas; escalar lo que no avanza",
      "quien": "JDL"
    },
    {
      "tema": "Cargar minuta y adjuntos de la reunión",
      "quien": "Analista de Presupuesto"
    }
  ]
}
$tor$::jsonb),

('iniciativas-ahorro', 'mensual', $tor$
{
  "nombre": "Reunión de Iniciativas de Ahorro",
  "objetivos": "Revisar mes a mes las iniciativas de ahorro comprometidas en el presupuesto (Rutina de Campeones, Planeamiento 5.2): cuánto ahorro real llevan contra el comprometido y cómo viene el KPI de cada una, con foco en obsolescencia (producto vencido), roturas y combustible. Decidir acciones cuando una iniciativa no rinde y proponer nuevas.",
  "dueno": [
    "JDL"
  ],
  "participantes": [
    "JDL — Sebastián Roselli",
    "Analista de Presupuesto — Estefanía Martínez",
    "SDD — Esteban Altube",
    "SDF / SDE — Fausto Azzaretti"
  ],
  "ubicacion": [
    "Oficina de Logística",
    "Zoom"
  ],
  "duracion": "10:00 hs — 45 min",
  "frecuencia_texto": "Mensual: 2º día hábil de cada mes, 10:00 hs. La app crea la reunión automáticamente.",
  "reglas": [
    "Ser puntual con la reunión; si alguien no puede asistir, avisar con anticipación",
    "Antes de la reunión, cada responsable actualiza su iniciativa en /presupuesto → Iniciativas de Ahorro (estado, seguimiento del trimestre si cerró, evidencia)",
    "Se revisa con el cierre del mes anterior: $ de vencidos, $ de roturas y derrames y rendimiento de combustible (km/l)",
    "Cada iniciativa se mira contra dos cosas: el ahorro $ comprometido y el KPI comprometido (línea base → objetivo)",
    "Una iniciativa que no rinde sale de la reunión con causa, compromiso y responsable en el Action Log",
    "Las iniciativas nuevas se cargan en la app con ahorro y KPI comprometidos antes de darlas por aprobadas"
  ],
  "entradas": [
    "Iniciativas de ahorro del año en /presupuesto (obsolescencia, roturas, combustible y otras) con su seguimiento",
    "Cierre del mes anterior: producto vencido y roturas/derrames del EERR (ppm por HL vendido) y rendimiento de combustible del registro de cargas",
    "Action Log de la reunión anterior"
  ],
  "salidas": [
    "Estado de cada iniciativa: ahorro real vs. comprometido y KPI vs. objetivo",
    "Seguimiento trimestral cargado en la app cuando cerró el trimestre",
    "Compromisos con responsable y fecha en el Action Log",
    "Iniciativas nuevas propuestas o dadas de baja"
  ],
  "kpis": [
    "Ahorro real acumulado vs. comprometido ($ y %) por iniciativa y total",
    "Obsolescencia: $ de producto vencido por mes y ppm por HL vendido vs. target",
    "Roturas: $ de roturas y derrames por mes y ppm por HL vendido vs. target",
    "Combustible: rendimiento km/l (camiones intervenidos vs. control) y litros evitados",
    "Viajes semanales a Colón (ruta 10)",
    "% de iniciativas implementadas sobre las planificadas"
  ],
  "temario": [
    {
      "tema": "Revisar el Action Log de la reunión anterior",
      "quien": "JDL"
    },
    {
      "tema": "Obsolescencia: vencidos del mes vs. objetivo (reducir vencidos al 70 %)",
      "quien": "SDD"
    },
    {
      "tema": "Roturas: roturas y derrames del mes vs. objetivo (−10 % anual)",
      "quien": "SDD"
    },
    {
      "tema": "Combustible: rendimiento km/l, limitadores de velocidad y ruta Colón",
      "quien": "SDF"
    },
    {
      "tema": "Ahorro $ consolidado del año vs. lo comprometido en el presupuesto",
      "quien": "Analista de Presupuesto"
    },
    {
      "tema": "Iniciativas que no rinden: causa y compromisos (Action Log)",
      "quien": "JDL"
    },
    {
      "tema": "Nuevas iniciativas de ahorro propuestas",
      "quien": "Todos"
    }
  ]
}
$tor$::jsonb)

ON CONFLICT (tipo, frecuencia) DO NOTHING;

COMMIT;
