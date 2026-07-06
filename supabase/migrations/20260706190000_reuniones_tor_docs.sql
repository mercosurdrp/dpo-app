-- =============================================
-- TOR (Términos de Referencia) por tipo de reunión — módulo /reuniones
-- =============================================
-- Una TOR por (tipo, frecuencia). El contenido replica el formato del Excel
-- "TORs_Reuniones_Mercosur RP.xlsx" (Book de Actas): objetivos, dueño,
-- participantes, ubicación, duración/horario, frecuencia, reglas, entradas,
-- salidas, KPIs y temario (temas a tratar + quién). Todo editable en la app.
-- Seed: TORs vigentes del Excel (mayo 2026).
-- =============================================

BEGIN;

CREATE TABLE IF NOT EXISTS reuniones_tor_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('logistica','logistica-ventas','matinal-distribucion','warehouse','presupuesto')),
  frecuencia text NOT NULL CHECK (frecuencia IN ('diaria','semanal','mensual')),
  contenido jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, frecuencia)
);

CREATE TRIGGER trg_reuniones_tor_docs_updated_at
  BEFORE UPDATE ON reuniones_tor_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reuniones_tor_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reuniones_tor_docs_read" ON reuniones_tor_docs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "reuniones_tor_docs_write" ON reuniones_tor_docs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','admin_rrhh')));

-- ---------------------------------------------
-- Seed desde el Excel de TORs
-- ---------------------------------------------

INSERT INTO reuniones_tor_docs (tipo, frecuencia, contenido) VALUES

-- ===== LOGÍSTICA =====
('logistica', 'diaria', $tor$
{
  "nombre": "Diaria Logística",
  "objetivos": "Revisión de los indicadores del área.",
  "dueno": ["JDL"],
  "participantes": ["Jefe de Logística", "SDD", "SDR", "SDF", "Analistas", "RR.HH", "Ruteador"],
  "ubicacion": ["Oficina de Choferes / Zoom"],
  "duracion": "8:30 hs — 40 min",
  "frecuencia_texto": "Diaria",
  "reglas": [
    "Empezar a horario, terminar a horario, una conversación a la vez",
    "Ir listo: 40% preparación, 10% en la reunión, 50% seguimiento",
    "Uso de Zoom/Kahoot en caso de ser necesario",
    "Focos: seguir la agenda",
    "Antes de abandonar la sala, asegurarse que cada cosa esté en su lugar, no dejar basura, hacer 5S",
    "Realizar la asistencia de la reunión"
  ],
  "entradas": ["Minuto de Seguridad", "Resultados exhibidos en el tablero visual", "Novedades del día"],
  "salidas": ["Equipo informado", "Retroalimentación", "Planes de acción"],
  "kpis": ["LTI / TRI", "Novedades de Check List", "Volumen distribuido", "TML - TI", "Ausentismos", "Prod. Picking", "Roturas", "Rechazos", "Seguimiento de SLA"],
  "temario": [
    {"tema": "Seguridad primero: minuto de Seguridad para la operación (siempre)", "quien": "RR.HH"},
    {"tema": "Revisión de planes de acción previos", "quien": "SDD, SDF, SDR"},
    {"tema": "Reporte de KPIs del día y planes de acción", "quien": "SDD, SDF, SDR"}
  ]
}
$tor$::jsonb),

('logistica', 'semanal', $tor$
{
  "nombre": "Reunión Semanal Logística",
  "objetivos": "Revisar la performance de los principales indicadores del área y establecer planes de acción para corregir desvíos.",
  "dueno": ["JDL"],
  "participantes": ["Jefe de Logística", "Supervisor de Ruta", "Supervisor de Depósito", "Analistas de Logística", "Supervisor de Flota", "Recursos Humanos", "Ruteador"],
  "ubicacion": ["Oficina de Logística / Zoom"],
  "duracion": "Viernes, 8:30 hs — 30 min",
  "frecuencia_texto": "Semanal",
  "reglas": [
    "Ser puntual con la reunión",
    "En caso de que haya un inconveniente que impida a alguna parte asistir, avisar con anticipación",
    "Comenzar repasando temas pendientes de reuniones anteriores",
    "Tener preparados los temas a tratar previamente para no demorar en cada punto",
    "Todos los integrantes deben saber actualizar la herramienta digital ASANA"
  ],
  "entradas": ["Action Log previos", "Tablero de indicadores"],
  "salidas": ["Planes de acción", "Registro de asistencias"],
  "kpis": ["LTI", "TRI", "Ausentismo", "TLP", "Rechazos", "In Full", "Avance DPO", "No acreditable (NAC)"],
  "temario": [
    {"tema": "Revisar el Action Log de la reunión anterior", "quien": "Analista de Logística / JDL"},
    {"tema": "Revisar reporte KPI", "quien": "Analista de Logística / JDL"},
    {"tema": "Actualizar Action Log", "quien": "Analista de Logística / JDL"}
  ]
}
$tor$::jsonb),

('logistica', 'mensual', $tor$
{
  "nombre": "Reunión Mensual Logística",
  "objetivos": "Realizar seguimiento de los principales indicadores del área y proponer acciones para cerrar gaps existentes.",
  "dueno": ["JDL"],
  "participantes": ["JDL", "SDR", "SDD", "RR.HH", "Analista de Compras", "Analistas de Logística", "Ruteador"],
  "ubicacion": ["Oficina de Logística"],
  "duracion": "Día 10 de cada mes, de 8:00 a 9:00",
  "frecuencia_texto": "Mensual",
  "reglas": [
    "Ser puntual con la reunión",
    "En caso de que haya un inconveniente que impida a alguna parte asistir, avisar con anticipación",
    "Comenzar repasando temas pendientes de reuniones anteriores",
    "Tener preparados los temas a tratar previamente para no demorar en cada punto"
  ],
  "entradas": ["Action Log previo", "Tablero 14 KPIs"],
  "salidas": ["Equipo de Logística alineado", "Planes de acción"],
  "kpis": ["Accidentes con Baja (LTI)", "Accidentes Totales (TRI)", "Rotación Personal (Turn Over)", "Ausentismo (Absenteeism)", "Rotura en Almacén (WQI)", "Rotura en Entrega (DQI)", "Nivel de Servicio (Entrega Completa) In Full", "Rechazo (Refusals)", "Productividad Total Almacén (WNP)", "Productividad de Autoelevador (FNP - x hora)", "Diferencia de Inventario", "Utilización de Vehículo", "Productividad Total Entrega (TLP)", "Ocupación de Bodega"],
  "temario": [
    {"tema": "Minuto de Seguridad", "quien": "RR.HH"},
    {"tema": "Revisar Action Log del último mes", "quien": "Analista de Logística / JDL"},
    {"tema": "Reporte de KPI mensual", "quien": "Analista de Logística / JDL"},
    {"tema": "Propuestas de iniciativas de ahorro", "quien": "Todos"}
  ]
}
$tor$::jsonb),

-- ===== LOGÍSTICA - VENTAS =====
('logistica-ventas', 'semanal', $tor$
{
  "nombre": "Reunión Ventas - Logística",
  "objetivos": "Realizar seguimiento de los indicadores de ambas áreas y definir acciones en caso de desvíos.",
  "dueno": ["JDL"],
  "participantes": ["JDV", "JDL", "JDA", "JDP", "RR.HH", "Gerente"],
  "ubicacion": ["Sala de reuniones", "Zoom"],
  "duracion": "Lunes 14:00 hs — 45 min",
  "frecuencia_texto": "Semanal",
  "reglas": [
    "Ser puntual con la reunión",
    "En caso de que haya un inconveniente que impida a alguna parte asistir, avisar con anticipación",
    "Comenzar repasando temas pendientes de reuniones anteriores",
    "Tener preparados los temas a tratar previamente para no demorar en cada punto",
    "Todos los integrantes deben saber actualizar la herramienta digital ASANA"
  ],
  "entradas": ["Action Log previos", "Reporte KPI"],
  "salidas": ["Equipos alineados", "Action Log"],
  "kpis": ["Rechazos", "SCI", "Reclamo de Clientes", "Frescura", "Cumplimiento de SLA", "Acciones comerciales", "NPS", "Fuera de ruta", "Stock por negocios"],
  "temario": [
    {"tema": "Revisar el Action Log de la semana anterior", "quien": "JDL / JDV"},
    {"tema": "Revisar reporte KPI", "quien": "JDL / JDV"},
    {"tema": "Compartir con ventas hallazgos de OWD en ruta", "quien": "JDL / JDV"},
    {"tema": "Compartir con ventas los feedback de choferes", "quien": "JDL / JDV"}
  ]
}
$tor$::jsonb),

-- ===== MATINAL DISTRIBUCIÓN =====
('matinal-distribucion', 'diaria', $tor$
{
  "nombre": "Diaria con Choferes y Ayudantes",
  "objetivos": "Alinear al equipo de distribución, mostrar comandos generales para el día y novedades de la ruta, revisar problemas de seguridad y hacer seguimiento de los procesos de salida, entrega y llegada del equipo de distribución con sus correspondientes indicadores.",
  "dueno": ["Supervisor de Ruta"],
  "participantes": ["Choferes", "Ayudantes", "Supervisor de Flota"],
  "ubicacion": ["Team Room"],
  "duracion": "12 minutos — inicio 07:00",
  "frecuencia_texto": "Diaria",
  "reglas": [
    "Empezar a horario, terminar a horario, una conversación a la vez",
    "Ir listo: 40% preparación, 10% en la reunión, 50% seguimiento",
    "Uso de Zoom/Kahoot en caso de ser necesario",
    "Antes de abandonar la sala, asegurarse que cada cosa esté en su lugar, no dejar basura, hacer 5S"
  ],
  "entradas": ["Minuto de Seguridad", "Mostrar acciones pendientes de reunión anterior", "Novedades del día", "Resultados exhibidos en el tablero visual"],
  "salidas": ["Todo el equipo alineado", "Retroalimentación a Supervisor de Ruta", "Planes de acción"],
  "kpis": ["TRI", "Driver Click Score", "Seguimiento de conductor", "Adherencia a la secuencia", "% de rechazos en bultos", "DQI", "TML", "TI (cierre financiero)", "TI (cierre físico)", "TLP"],
  "temario": [
    {"tema": "Action Log", "quien": "SDR"},
    {"tema": "Seguridad primero: minuto de Seguridad para la operación (siempre)", "quien": "SDF"},
    {"tema": "Reporte: resultados del último día y foco en este día", "quien": "Choferes y ayudantes"},
    {"tema": "Recomendaciones de flota", "quien": "SDF"},
    {"tema": "Feedback problemas en ruta", "quien": "Choferes y ayudantes"}
  ]
}
$tor$::jsonb),

('matinal-distribucion', 'semanal', $tor$
{
  "nombre": "Semanal con Choferes y Ayudantes",
  "objetivos": "Mostrar el resumen del desempeño del equipo de distribución en la semana anterior.",
  "dueno": ["Supervisor de Ruta"],
  "participantes": ["Choferes", "Ayudantes", "Supervisor de Flota", "RR.HH"],
  "ubicacion": ["Team Room"],
  "duracion": "20 minutos — inicio 07:00",
  "frecuencia_texto": "Lunes de cada semana",
  "reglas": [
    "Respeto hacia los otros: empezar a horario, terminar a horario, una conversación a la vez",
    "Ir listo: 40% preparación, 10% en la reunión, 50% seguimiento",
    "Uso de Zoom/Kahoot en caso de ser necesario",
    "Focos: seguir la agenda",
    "Antes de abandonar la sala, asegurarse que cada cosa esté en su lugar, no dejar basura, hacer 5S"
  ],
  "entradas": ["Minuto de Seguridad", "Mostrar acciones pendientes de reunión anterior", "Novedades del día", "Resultados exhibidos en el tablero visual", "Hallazgos de la salida a ruta de la semana anterior"],
  "salidas": ["Todo el equipo alineado", "Retroalimentación a Supervisor de Ruta", "Planes de acción"],
  "kpis": ["TRI", "Driver Click Score", "Seguimiento de conductor", "Adherencia a la secuencia", "% de rechazos en bultos", "Horas en ruta", "TLP", "OB", "Reclamos de clientes", "RMD", "Tiempo en PDV", "Cantidad PNP"],
  "temario": [
    {"tema": "Minuto de Seguridad", "quien": "SDR / RR.HH"},
    {"tema": "Mostrar acciones pendientes de reunión anterior", "quien": "SDR"},
    {"tema": "Novedades del día", "quien": "SDR"},
    {"tema": "Resultados exhibidos en el tablero visual", "quien": "SDR"},
    {"tema": "Hallazgos de la salida a ruta de la semana anterior", "quien": "SDR / SDF"},
    {"tema": "Recomendaciones de flota", "quien": "SDF"},
    {"tema": "Feedback problemas en ruta", "quien": "Choferes y ayudantes"}
  ]
}
$tor$::jsonb),

('matinal-distribucion', 'mensual', $tor$
{
  "nombre": "Mensual con Choferes y Ayudantes",
  "objetivos": "Mostrar el resumen del desempeño del equipo de distribución del mes anterior.",
  "dueno": ["Supervisor de Ruta"],
  "participantes": ["Choferes", "Ayudantes", "Jefe de Logística", "Supervisor de Flota", "RR.HH"],
  "ubicacion": ["Team Room"],
  "duracion": "20 minutos — inicio 07:00",
  "frecuencia_texto": "1er martes de cada mes",
  "reglas": [
    "Respeto hacia los otros: empezar a horario, terminar a horario, una conversación a la vez",
    "Ir listo: 40% preparación, 10% en la reunión, 50% seguimiento",
    "Uso de Zoom/Kahoot en caso de ser necesario",
    "Focos: seguir la agenda",
    "Antes de abandonar la sala, asegurarse que cada cosa esté en su lugar, no dejar basura, hacer 5S"
  ],
  "entradas": ["Minuto de Seguridad", "Mostrar acciones pendientes de reunión anterior", "Novedades del día", "Resultados exhibidos en el tablero visual"],
  "salidas": ["Todo el equipo alineado", "Retroalimentación a Supervisor de Ruta", "Planes de acción", "Objetivos para este mes"],
  "kpis": ["TRI", "Excesos de velocidad", "Driver Click Score", "Seguimiento de conductor", "Adherencia a la secuencia", "% de rechazos en bultos", "Adherencia a la modulación", "DQI", "TML", "TI (cierre financiero)", "TI (cierre físico)", "Horas en ruta", "TLP", "OB", "Rate My Delivery", "Errores de entrega"],
  "temario": [
    {"tema": "Minuto de Seguridad", "quien": "SDR / JDL / RR.HH"},
    {"tema": "Mostrar acciones pendientes de reunión anterior", "quien": "SDR"},
    {"tema": "Novedades del día", "quien": "SDR"},
    {"tema": "Resultados exhibidos en el tablero visual", "quien": "SDR"},
    {"tema": "Recomendaciones de flota", "quien": "SDF"},
    {"tema": "Feedback problemas en ruta", "quien": "Choferes y ayudantes"},
    {"tema": "Reconocimientos al desempeño", "quien": "SDR / SDF / JDL / RR.HH"}
  ]
}
$tor$::jsonb),

-- ===== WAREHOUSE =====
('warehouse', 'diaria', $tor$
{
  "nombre": "Diaria Warehouse",
  "objetivos": "Confirmar presencia del equipo de Depósito; alinear a todo el equipo con los resultados del día anterior; definir prioridades y objetivos diarios.",
  "dueno": ["SDD"],
  "participantes": ["Sup. de Warehouse", "Operarios internos", "Autoelevadoristas", "Auxiliares"],
  "ubicacion": ["Warehouse"],
  "duracion": "15 hs — 30 min",
  "frecuencia_texto": "Diaria",
  "reglas": [
    "Empezar a horario, terminar a horario, una conversación a la vez",
    "Ir listo: 40% preparación, 10% en la reunión, 50% seguimiento",
    "Uso de Zoom/Kahoot en caso de ser necesario",
    "Focos: seguir la agenda",
    "Antes de abandonar la sala, asegurarse que cada cosa esté en su lugar, no dejar basura, hacer 5S"
  ],
  "entradas": ["Minuto de seguridad (videos/PPS)", "Action Logs anteriores", "Resultados del último día"],
  "salidas": ["Feedback del equipo de Depósito", "Todo el equipo alineado a los resultados de KPI", "Action Log para desvíos"],
  "kpis": ["LTI (Accidentes con baja)", "TRI", "Ausentismos", "Productividad de Picking", "Roturas", "Novedades del día"],
  "temario": [
    {"tema": "Seguridad primero: minuto de Seguridad para la operación (siempre)", "quien": "SDD"},
    {"tema": "Reporte: resultados del último día y foco en este día", "quien": "SDD"},
    {"tema": "Entrenamiento del día", "quien": "SDD"},
    {"tema": "Pendientes, definiciones, focos de acción", "quien": "SDD"}
  ]
}
$tor$::jsonb),

('warehouse', 'semanal', $tor$
{
  "nombre": "Semanal Warehouse",
  "objetivos": "Confirmar presencia del equipo de Depósito; alinear a todo el equipo con los resultados de la semana; definir prioridades y objetivos.",
  "dueno": ["SDD"],
  "participantes": ["SDD", "Pickeros", "Autoelevadoristas", "Auxiliares"],
  "ubicacion": ["Warehouse"],
  "duracion": "Viernes, 14:30 hs — 30 min",
  "frecuencia_texto": "Semanal",
  "reglas": [
    "Empezar a horario, terminar a horario, una conversación a la vez",
    "Ir listo: 40% preparación, 10% en la reunión, 50% seguimiento",
    "Uso de Zoom/Kahoot en caso de ser necesario",
    "Focos: seguir la agenda",
    "Antes de abandonar la sala, asegurarse que cada cosa esté en su lugar, no dejar basura, hacer 5S"
  ],
  "entradas": ["Planes de acción previos", "Reporte de KPI", "OWD de última semana"],
  "salidas": ["Feedback del equipo de Depósito", "Todo el equipo alineado a los resultados de KPI", "Action Log para desvíos"],
  "kpis": ["LTI", "TRI", "Productividad de Picking", "FLP", "Clasificación de Envases", "Tiempo de carga", "Tiempo de descarga", "WNP"],
  "temario": [
    {"tema": "Minuto de Seguridad", "quien": "SDD"},
    {"tema": "Action Log de la semana previa", "quien": "SDD"},
    {"tema": "Seguimiento de reporte KPI (actualizado mostrando semana anterior y MTD)", "quien": "SDD"},
    {"tema": "Revisar plan y acciones 5S de Depósito", "quien": "SDD"},
    {"tema": "Hallazgos provenientes de las OWD de la semana previa", "quien": "SDD"},
    {"tema": "Seguimiento de la evolución del SLA desde la semana anterior", "quien": "SDD"},
    {"tema": "Revisar acciones para la semana próxima", "quien": "SDD"}
  ]
}
$tor$::jsonb),

('warehouse', 'mensual', $tor$
{
  "nombre": "Reunión Mensual Warehouse",
  "objetivos": "Repasar con todo el equipo los resultados del mes de Warehouse; alinear, definir y coordinar las acciones con el equipo.",
  "dueno": ["SDD"],
  "participantes": ["JDL", "SDD", "Pickeros", "Autoelevadoristas", "Auxiliares", "Analistas de Logística"],
  "ubicacion": ["Team Room WH"],
  "duracion": "Primer viernes de cada mes — 14 hs",
  "frecuencia_texto": "Mensual",
  "reglas": [
    "Ser puntual con la reunión",
    "En caso de que haya un inconveniente que impida a alguna parte asistir, avisar con anticipación",
    "Comenzar repasando temas pendientes de reuniones anteriores",
    "Tener preparados los temas a tratar previamente para no demorar en cada punto"
  ],
  "entradas": ["Action Logs previos", "Reporte KPI"],
  "salidas": ["Equipo de WH alineado", "Planes de acción"],
  "kpis": ["LTI (Accidentes con baja)", "TRI", "Productividad de Picking", "WQI", "WLP/WNP", "FNP", "Vencidos", "Dif. de inventario", "Clasificación de Envases", "NAC", "Avance DPO"],
  "temario": [
    {"tema": "Minuto de Seguridad", "quien": "SDD"},
    {"tema": "Action Log del mes previo", "quien": "SDD"},
    {"tema": "Seguimiento de reporte KPI (actualizado mostrando mes anterior y MTD)", "quien": "SDD"},
    {"tema": "Revisar plan y acciones 5S de Depósito", "quien": "SDD"},
    {"tema": "Hallazgos provenientes de las OWD del mes previo", "quien": "SDD"},
    {"tema": "Seguimiento de la evolución del SLA desde el mes anterior", "quien": "SDD"},
    {"tema": "Revisar acciones para el mes próximo", "quien": "SDD"}
  ]
}
$tor$::jsonb)

ON CONFLICT (tipo, frecuencia) DO NOTHING;

COMMIT;
